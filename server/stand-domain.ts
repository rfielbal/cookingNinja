import { COUNTDOWN_SECONDS, CUT_SECONDS, MIX_SECONDS } from '../shared/round.js';
import {
  FOCUS_MAX_BONUS,
  HEART_SPAWN_TIMES,
  maximumSpawns,
  MAX_HEARTS,
  SHINY_SPAWN_TIMES,
} from '../src/game/events.js';
import { RECIPES, type RecipeId } from '../src/game/recipes.js';

export const RULES_VERSION = 'stand-v0.6-minute';

// Historical records are checked against their original rules, never today's recipe quotas.
const HISTORIC_RECIPES = {
  burger: { requiredHits: 25, spawnInterval: 1.1 },
  tacos: { requiredHits: 30, spawnInterval: 0.95 },
  cake: { requiredHits: 32, spawnInterval: 0.82 },
} as const;
const HISTORIC_HEART_TIMES = [18, 40, 62] as const;
export type ControlMode = 'motion' | 'touch' | 'mouse';
export type Outcome = 'won' | 'hearts' | 'ingredients' | 'mix';
export interface RunStart {
  nickname: string;
  recipeId: RecipeId;
  mode: ControlMode;
}
export interface RunResult {
  score: number;
  outcome: Outcome;
  hits: number;
  mistakes: number;
  bestCombo: number;
}
export interface StandRun extends RunStart {
  id: string;
  rulesVersion: string;
  createdAt: string;
  result?: RunResult & { finishedAt: string };
}
export interface LeaderboardEntry extends RunStart, RunResult {
  id: string;
  rulesVersion: string;
  createdAt: string;
  finishedAt: string;
}
export type LeaderboardScope = 'current-rules' | 'all-time';
export interface RankedLeaderboardEntry extends LeaderboardEntry {
  rank: number;
}
export interface LeaderboardQuery {
  recipeId?: string;
  mode?: ControlMode;
  limit?: number;
  scope?: LeaderboardScope;
  highlightEntryId?: string;
}
export interface LeaderboardPage {
  entries: RankedLeaderboardEntry[];
  total: number;
  highlight: { entry: RankedLeaderboardEntry; rank: number } | null;
  scope: LeaderboardScope;
  rulesVersion: string;
}
export class StandError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StandError(400, 'Un objet JSON est attendu.');
  }
  return value as Record<string, unknown>;
}
function integer(value: unknown, min: number, max: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
}
export function validRecipe(value: unknown): value is RecipeId {
  return RECIPES.some((recipe) => recipe.id === value);
}
export function validMode(value: unknown): value is ControlMode {
  return value === 'motion' || value === 'touch' || value === 'mouse';
}
export function parseLeaderboardQuery(value: unknown): LeaderboardQuery {
  const { recipeId, mode, limit, scope, highlightEntryId } = object(value);
  if (recipeId !== undefined && !validRecipe(recipeId))
    throw new StandError(400, 'Recette invalide.');
  if (mode !== undefined && !validMode(mode)) throw new StandError(400, 'Mode invalide.');
  if (scope !== undefined && scope !== 'current-rules' && scope !== 'all-time')
    throw new StandError(400, 'Périmètre de classement invalide.');
  if (
    highlightEntryId !== undefined &&
    (typeof highlightEntryId !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(highlightEntryId))
  )
    throw new StandError(400, 'Identifiant de résultat invalide.');
  const count =
    limit === undefined
      ? 20
      : typeof limit === 'string' && /^\d+$/.test(limit)
        ? Number(limit)
        : NaN;
  if (!Number.isInteger(count) || count < 1 || count > 100)
    throw new StandError(400, 'Limite de classement invalide.');
  return {
    recipeId: recipeId as RecipeId | undefined,
    mode: mode as ControlMode | undefined,
    limit: count,
    scope: scope ?? 'current-rules',
    highlightEntryId,
  };
}
export function parseRunStart(value: unknown): RunStart {
  const body = object(value);
  if (typeof body.nickname !== 'string' || body.nickname.length > 100) {
    throw new StandError(400, 'Choisissez un pseudo de 2 à 20 caractères.');
  }
  const nickname = body.nickname.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (
    Array.from(nickname).length < 2 ||
    Array.from(nickname).length > 20 ||
    !/^[\p{L}\p{N} _.'’-]+$/u.test(nickname)
  ) {
    throw new StandError(
      400,
      'Le pseudo doit contenir 2 à 20 lettres, chiffres, espaces, points, apostrophes ou tirets.',
    );
  }
  if (!validRecipe(body.recipeId) || !validMode(body.mode)) {
    throw new StandError(400, 'Recette ou mode de contrôle invalide.');
  }
  return { nickname, recipeId: body.recipeId, mode: body.mode };
}
export function parseRunResult(value: unknown): RunResult {
  const body = object(value);
  if (
    !integer(body.score, 0, 50_000) ||
    !integer(body.hits, 0, 200) ||
    !integer(body.mistakes, 0, MAX_HEARTS + HEART_SPAWN_TIMES.length) ||
    !integer(body.bestCombo, 0, 200) ||
    !['won', 'hearts', 'ingredients', 'mix'].includes(body.outcome as string)
  ) {
    throw new StandError(400, 'Résultat de partie invalide.');
  }
  return {
    score: body.score,
    hits: body.hits,
    mistakes: body.mistakes,
    bestCombo: body.bestCombo,
    outcome: body.outcome as Outcome,
  };
}

/** Plausibility checks only: the supervised PC still computes collisions and score. */
export function validateResult(run: StandRun, result: RunResult, now: number): void {
  const recipe = RECIPES.find((item) => item.id === run.recipeId)!;
  const legacy = run.rulesVersion === 'stand-v0.2';
  const previousEvents = run.rulesVersion === 'stand-v0.3-events';
  const previousFrenzy = run.rulesVersion === 'stand-v0.4-frenzy';
  const minute = run.rulesVersion === RULES_VERSION;
  const healing = minute || run.rulesVersion === 'stand-v0.5-hearts';
  if (!legacy && !previousEvents && !previousFrenzy && !healing)
    throw new StandError(422, 'Cette version des règles n’est plus prise en charge.');
  const historical = HISTORIC_RECIPES[run.recipeId];
  const cutSeconds = minute ? CUT_SECONDS : 80;
  const mixSeconds = minute ? MIX_SECONDS : 8;
  const countdownSeconds = minute ? COUNTDOWN_SECONDS : 3;
  const requiredHits = minute ? recipe.ingredients.length * recipe.goal : historical.requiredHits;
  const heartTimes = minute ? HEART_SPAWN_TIMES : HISTORIC_HEART_TIMES;
  const maxSpawns = minute
    ? maximumSpawns(CUT_SECONDS, recipe.spawnInterval)
    : legacy
      ? Math.ceil(80 / historical.spawnInterval) + 1
      : // Old event rounds: 80 s + two 10 s rushes at ×1.5, nine specials, then two rares.
        Math.ceil(90 / historical.spawnInterval) + 1 + 9 + (previousEvents ? 0 : 2);
  const focusBonus = minute ? FOCUS_MAX_BONUS : 1_500;
  const focusCount = minute ? SHINY_SPAWN_TIMES.length : 2;
  const hitScoreCeiling = previousEvents
    ? result.hits * 400
    : !legacy
      ? result.hits * 200 + Math.min(focusCount, result.hits) * focusBonus
      : result.hits <= 11
        ? 100 * result.hits + 5 * result.hits * (result.hits - 1)
        : 1_650 + (result.hits - 11) * 200;
  const maximumMistakes = healing ? MAX_HEARTS + heartTimes.length : MAX_HEARTS;
  const validMistakes =
    result.outcome === 'hearts'
      ? legacy
        ? result.mistakes === 3
        : result.mistakes >= 2 && result.mistakes <= maximumMistakes
      : result.mistakes >= 0 && result.mistakes < maximumMistakes;
  if (
    result.hits + result.mistakes > maxSpawns ||
    result.bestCombo > result.hits ||
    (result.hits > 0 && result.bestCombo === 0) ||
    result.score < result.hits * 100 ||
    result.score > hitScoreCeiling + (result.outcome === 'won' ? 500 : 0) ||
    !validMistakes ||
    (['won', 'mix'].includes(result.outcome) && result.hits < requiredHits) ||
    (result.outcome === 'won' && result.score < result.hits * 100 + 175)
  ) {
    throw new StandError(422, 'Ce résultat ne correspond pas aux règles de la recette.');
  }
  const elapsed = now - Date.parse(run.createdAt);
  // Without a client-supplied healing count, bound errors by the earliest possible recovery.
  const requiredHeals = healing
    ? Math.max(0, result.mistakes - (result.outcome === 'hearts' ? MAX_HEARTS : MAX_HEARTS - 1))
    : 0;
  const earliestHealing = requiredHeals
    ? (countdownSeconds + heartTimes[requiredHeals - 1]) * 1_000
    : 0;
  const minimum =
    result.outcome === 'hearts'
      ? Math.max(countdownSeconds * 1_000, earliestHealing)
      : // Preserve the existing two-second allowance between the client and server clocks.
        (cutSeconds + (result.outcome === 'ingredients' ? 0 : mixSeconds) + countdownSeconds - 2) *
        1_000;
  if (elapsed < minimum || elapsed > 24 * 60 * 60 * 1_000) {
    throw new StandError(422, 'La durée de cette partie est invalide ou la partie a expiré.');
  }
}
export function sameResult(left: RunResult, right: RunResult): boolean {
  return (
    left.score === right.score &&
    left.outcome === right.outcome &&
    left.hits === right.hits &&
    left.mistakes === right.mistakes &&
    left.bestCombo === right.bestCombo
  );
}
