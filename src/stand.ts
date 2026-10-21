import type { GameState } from './game/engine';
import type { RecipeId } from './game/recipes';

export type ControlMode = 'motion' | 'touch' | 'mouse';
export const CONTROL_LABELS: Record<ControlMode, string> = {
  motion: 'Gyroscope',
  touch: 'Pavé tactile',
  mouse: 'Souris',
};
export interface ScoreEntry {
  id: string;
  nickname: string;
  score: number;
  recipeId: RecipeId;
  mode: ControlMode;
  bestCombo: number;
  rulesVersion: string;
  finishedAt: string;
  rank: number;
}
export interface Scoreboard {
  entries: ScoreEntry[];
  total: number;
  highlight: { entry: ScoreEntry; rank: number } | null;
  scope: 'all-time' | 'current-rules';
  rulesVersion: string;
}

async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    ...(body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Le classement est indisponible.');
  return response.json() as Promise<T>;
}
export const startRun = (nickname: string, recipeId: string, mode: ControlMode) =>
  request<{ id: string }>('/api/runs', { nickname, recipeId, mode });
export const finishRun = (id: string, state: GameState) =>
  request(`/api/runs/${encodeURIComponent(id)}/finish`, {
    score: state.score,
    outcome: state.outcome,
    hits: state.hits,
    mistakes: state.mistakes,
    bestCombo: state.bestCombo,
  });
export const getLeaderboard = (recipeId: RecipeId | 'all' = 'all', highlightEntryId?: string) => {
  const query = new URLSearchParams({ scope: 'all-time' });
  if (recipeId !== 'all') query.set('recipeId', recipeId);
  if (highlightEntryId) query.set('highlightEntryId', highlightEntryId);
  return request<Scoreboard>(`/api/leaderboard?${query}`);
};
export const newNickname = () => `Ninja-${Math.floor(1000 + Math.random() * 9000)}`;
