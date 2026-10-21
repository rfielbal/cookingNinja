import type { FoodKind } from './recipes';

export type SpecialKind = 'shield' | 'slow' | 'danger' | 'heart';
export type ArenaKind = FoodKind | SpecialKind;
export type ArenaEvent = 'normal' | 'rush' | 'slow' | 'focus';
export type HitResult =
  | 'good'
  | 'bad'
  | 'shield'
  | 'slow'
  | 'danger'
  | 'blocked'
  | 'focus-start'
  | 'focus-cut'
  | 'heal'
  | 'full-health';

export interface FocusState {
  id: string;
  kind: FoodKind;
  remaining: number;
  cuts: number;
  /** Pending bonus, added to the score only when the focus finishes. */
  points: number;
}

export const SHIELD_SECONDS = 10;
export const MAX_HEARTS = 3;
export const HEART_SPAWN_TIMES: readonly number[] = [18, 40, 62];
export const SLOW_POINTS = 100;
export const SLOW_SECONDS = 5;
export const SLOW_WORLD_SPEED = 0.55;
export const DANGER_HEARTS = 2;
export const RUSH_CADENCE_MULTIPLIER = 1.5;
export const RUSH_WORLD_SPEED = 1.65;
export const FOCUS_SECONDS = 3;
export const FOCUS_CUT_INTERVAL = 0.11;
export const FOCUS_POINTS_PER_CUT = 50;
export const FOCUS_MAX_BONUS = 1_500;
export const SHINY_SPAWN_TIMES: readonly number[] = [12, 42];
export const SPECIAL_SPAWN_INTERVAL = 8;
export const ACTIVE_LIFETIME = 8;
export const SPECIAL_SEQUENCE: readonly SpecialKind[] = ['shield', 'danger', 'slow'];
export const RUSH_WINDOWS: readonly { start: number; end: number }[] = [
  { start: 20, end: 30 },
  { start: 50, end: 60 },
];

export function isSpecialKind(kind: ArenaKind): kind is SpecialKind {
  return kind === 'shield' || kind === 'slow' || kind === 'danger' || kind === 'heart';
}

export function getRushWindow(elapsed: number) {
  return RUSH_WINDOWS.find(({ start, end }) => elapsed >= start && elapsed < end);
}

/** Real-time overlap; slowdown can affect the cadence without moving the event windows. */
export function rushDurationBetween(from: number, to: number): number {
  return RUSH_WINDOWS.reduce(
    (total, { start, end }) => total + Math.max(0, Math.min(to, end) - Math.max(from, start)),
    0,
  );
}

/** Hearts are opt-in: healing never contributes to the score validator's hit/error budget. */
export function maximumSpawns(
  duration: number,
  foodInterval: number,
  includeShiny = true,
  includeHearts = false,
): number {
  const cadenceTime = duration + rushDurationBetween(0, duration) * (RUSH_CADENCE_MULTIPLIER - 1);
  const specials = Math.max(0, Math.ceil(duration / SPECIAL_SPAWN_INTERVAL) - 1);
  const shiny = includeShiny ? SHINY_SPAWN_TIMES.filter((at) => at < duration).length : 0;
  const hearts = includeHearts ? HEART_SPAWN_TIMES.filter((at) => at < duration).length : 0;
  return Math.ceil(cadenceTime / foodInterval) + 1 + specials + shiny + hearts;
}
