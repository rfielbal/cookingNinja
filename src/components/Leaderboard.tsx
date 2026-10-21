import { useEffect, useId, useState, type CSSProperties } from 'react';
import {
  ArrowUpRight,
  CakeSlice,
  ChefHat,
  Crown,
  Flame,
  Medal,
  RefreshCw,
  Sandwich,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { type RecipeId } from '../game/recipes';
import { getLeaderboard, type ScoreEntry } from '../stand';
import { DishArt } from './DishArt';
import './leaderboard.css';

type BoardId = RecipeId | 'all';
type BoardDefinition = {
  id: BoardId;
  title: string;
  label: string;
  subtitle: string;
  accent: string;
  icon: LucideIcon;
};
type BoardData = {
  status: 'loading' | 'ready' | 'error';
  entries: ScoreEntry[];
  total: number;
  highlight: { entry: ScoreEntry; rank: number } | null;
};
const BOARDS: BoardDefinition[] = [
  {
    id: 'all',
    title: 'Le grand classement',
    label: 'GÉNÉRAL',
    subtitle: 'Toutes les recettes entrent en scène.',
    accent: '#ffd17a',
    icon: Trophy,
  },
  {
    id: 'burger',
    title: 'Ninja Burger',
    label: 'RECETTE 01',
    subtitle: 'Les maîtres du classique.',
    accent: '#ffb580',
    icon: Sandwich,
  },
  {
    id: 'tacos',
    title: 'Tacos Loco',
    label: 'RECETTE 02',
    subtitle: 'Du rythme et du piquant.',
    accent: '#abe1ac',
    icon: Flame,
  },
  {
    id: 'cake',
    title: 'Choco Sensei',
    label: 'RECETTE 03',
    subtitle: 'La précision a du bon.',
    accent: '#e6bae2',
    icon: CakeSlice,
  },
];
const RECIPE_LABELS: Record<RecipeId, string> = {
  burger: 'Ninja Burger',
  tacos: 'Tacos Loco',
  cake: 'Choco Sensei',
};
const number = new Intl.NumberFormat('fr-FR');
const emptyBoard = (): BoardData => ({ status: 'loading', entries: [], total: 0, highlight: null });
const initialBoards = (): Record<BoardId, BoardData> => ({
  all: emptyBoard(),
  burger: emptyBoard(),
  tacos: emptyBoard(),
  cake: emptyBoard(),
});

export interface LeaderboardProps {
  variant?: 'home' | 'result';
  recipe?: RecipeId;
  /** An exact saved run id; nicknames do not identify a player. */
  highlightEntryId?: string;
  /** Change after a result is saved to refresh both ranks. */
  refreshKey?: string | number;
  onPlay?: (recipe?: RecipeId) => void;
}

export function Leaderboard({
  variant = 'home',
  recipe = 'burger',
  highlightEntryId,
  refreshKey,
  onPlay,
}: LeaderboardProps) {
  const titleId = useId();
  const [boards, setBoards] = useState(initialBoards);
  const [attempt, setAttempt] = useState(0);
  const definitions =
    variant === 'result'
      ? BOARDS.filter((board) => board.id === 'all' || board.id === recipe)
      : BOARDS;
  const refreshing = definitions.some((board) => boards[board.id].status === 'loading');
  useEffect(() => {
    let active = true;
    const selected =
      variant === 'result'
        ? BOARDS.filter((board) => board.id === 'all' || board.id === recipe)
        : BOARDS;
    setBoards((current) => {
      const next = { ...current };
      for (const { id } of selected) {
        next[id] = {
          ...current[id],
          status: 'loading',
          highlight:
            current[id].highlight?.entry.id === highlightEntryId ? current[id].highlight : null,
        };
      }
      return next;
    });
    // Each board can succeed independently when one request is interrupted.
    for (const { id } of selected) {
      void getLeaderboard(id, highlightEntryId).then(
        (result) => {
          if (!active) return;
          setBoards((current) => ({
            ...current,
            [id]: {
              status: 'ready',
              entries: result.entries,
              total: result.total,
              highlight: result.highlight,
            },
          }));
        },
        () => {
          if (!active) return;
          setBoards((current) => ({ ...current, [id]: { ...current[id], status: 'error' } }));
        },
      );
    }
    return () => {
      active = false;
    };
  }, [variant, recipe, highlightEntryId, refreshKey, attempt]);
  return (
    <section className={`cn-leaderboards cn-leaderboards-${variant}`} aria-labelledby={titleId}>
      <header className="cn-boards-heading">
        <div>
          <p className="cn-boards-eyebrow">
            <Trophy size={15} aria-hidden="true" /> LE TABLEAU D’HONNEUR
          </p>
          <h2 id={titleId}>
            {variant === 'result' ? 'Les records à battre.' : 'Les légendes du dojo.'}
          </h2>
          <p className="cn-boards-intro">
            {variant === 'result'
              ? 'Le général et votre recette, côte à côte.'
              : 'Quatre tableaux. De beaux gestes. Une place à prendre.'}
          </p>
        </div>
        <button
          type="button"
          className="cn-boards-refresh"
          disabled={refreshing}
          onClick={() => setAttempt((value) => value + 1)}
          aria-label="Actualiser tous les classements"
        >
          <RefreshCw size={16} className={refreshing ? 'is-refreshing' : ''} aria-hidden="true" />
          <span>{refreshing ? 'Actualisation' : 'Actualiser'}</span>
        </button>
      </header>
      <div className="cn-boards-grid">
        {definitions.map((definition, index) => (
          <BoardCard
            key={definition.id}
            definition={definition}
            data={boards[definition.id]}
            index={index}
            limit={variant === 'result' ? 8 : 5}
            highlightEntryId={highlightEntryId}
            onRetry={() => setAttempt((value) => value + 1)}
            onPlay={onPlay}
          />
        ))}
      </div>
      <div className="cn-boards-footnote">
        <p>
          Records du stand · toutes commandes et versions du jeu. Une ligne = une recette réussie.
        </p>
        <details className="cn-boards-history">
          <summary>À propos des versions</summary>
          <p>
            Les règles et les bonus ont évolué. Les scores des anciennes versions ne sont donc pas
            strictement comparables.
          </p>
        </details>
      </div>
    </section>
  );
}

function BoardCard({
  definition,
  data,
  index,
  limit,
  highlightEntryId,
  onRetry,
  onPlay,
}: {
  definition: BoardDefinition;
  data: BoardData;
  index: number;
  limit: number;
  highlightEntryId?: string;
  onRetry: () => void;
  onPlay?: (recipe?: RecipeId) => void;
}) {
  const headingId = useId();
  const Icon = definition.icon;
  const general = definition.id === 'all';
  const entries = data.entries.slice(0, limit);
  const hasEntries = entries.length > 0;
  const selected = data.highlight;
  const style = { '--board-accent': definition.accent, '--board-order': index } as CSSProperties;
  return (
    <article
      className={`cn-board cn-board-${definition.id}`}
      style={style}
      aria-labelledby={headingId}
      aria-busy={data.status === 'loading'}
    >
      <header className="cn-board-heading">
        <div>
          <span className="cn-board-category">
            <Icon size={14} aria-hidden="true" /> {definition.label}
          </span>
          <h3 id={headingId}>{definition.title}</h3>
          <p>{definition.subtitle}</p>
        </div>
        <div className={`cn-board-art ${general ? 'is-trophy' : ''}`} aria-hidden="true">
          {general ? <Trophy strokeWidth={1.3} /> : <DishArt recipe={definition.id as RecipeId} />}
        </div>
      </header>
      {data.status === 'loading' && !hasEntries ? (
        <div className="cn-board-loading" role="status">
          <span className="cn-board-loading-medal">
            <Medal size={30} aria-hidden="true" />
          </span>
          <span className="cn-board-loading-line" />
          <span className="cn-board-loading-line is-short" />
          <p>On prépare le podium…</p>
        </div>
      ) : data.status === 'error' && !hasEntries ? (
        <div className="cn-board-empty cn-board-unavailable" role="status">
          <span className="cn-board-empty-icon">
            <Trophy size={30} aria-hidden="true" />
          </span>
          <h4>Le tableau se fait attendre.</h4>
          <p>Les scores ne sont pas disponibles pour le moment.</p>
          <button type="button" className="cn-board-inline-button" onClick={onRetry}>
            <RefreshCw size={14} aria-hidden="true" /> Réessayer
          </button>
        </div>
      ) : !hasEntries ? (
        <div className="cn-board-empty">
          <span className="cn-board-empty-icon">
            <ChefHat size={37} strokeWidth={1.5} aria-hidden="true" />
            <i aria-hidden="true">✦</i>
          </span>
          <h4>La première place vous attend.</h4>
          <p>
            {general
              ? 'Une recette réussie, et le premier nom entre au tableau.'
              : 'Réussissez cette recette pour signer le premier record.'}
          </p>
          {onPlay && (
            <button
              type="button"
              className="cn-board-inline-button"
              onClick={() => onPlay(general ? undefined : (definition.id as RecipeId))}
            >
              Entrer en cuisine <ArrowUpRight size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      ) : (
        <>
          <ol className="cn-board-podium" aria-label="Les trois premières places">
            {[1, 2, 3].map((rank) => {
              const entry = entries[rank - 1];
              const own = entry?.id === highlightEntryId;
              return (
                <li
                  key={rank}
                  className={`cn-podium-place cn-podium-place-${rank} ${entry ? '' : 'is-vacant'} ${own ? 'is-player' : ''}`}
                >
                  {entry ? (
                    <>
                      <span className="cn-podium-avatar" aria-hidden="true">
                        {rank === 1 && (
                          <Crown className="cn-podium-crown" size={25} fill="currentColor" />
                        )}
                        {Array.from(entry.nickname.trim())[0]?.toLocaleUpperCase('fr')}
                        {own && <span className="cn-podium-you">VOUS</span>}
                      </span>
                      <strong className="cn-podium-name" title={entry.nickname}>
                        {entry.nickname}
                      </strong>
                      <span className="cn-podium-score">
                        {number.format(entry.score)}
                        <small>pts</small>
                      </span>
                      {general && (
                        <span className="cn-podium-recipe">{RECIPE_LABELS[entry.recipeId]}</span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="cn-podium-avatar" aria-hidden="true">
                        <Medal size={21} />
                      </span>
                      <span className="cn-podium-name">Place libre</span>
                    </>
                  )}
                  <span
                    className="cn-podium-step"
                    aria-label={`${rank === 1 ? 'Première' : rank === 2 ? 'Deuxième' : 'Troisième'} place`}
                  >
                    {String(rank).padStart(2, '0')}
                  </span>
                </li>
              );
            })}
          </ol>
          {entries.length > 3 && (
            <ol className="cn-board-rows" start={4} aria-label="La suite du classement">
              {entries.slice(3).map((entry) => (
                <li key={entry.id} className={entry.id === highlightEntryId ? 'is-player' : ''}>
                  <span className="cn-board-rank">{String(entry.rank).padStart(2, '0')}</span>
                  <span className="cn-board-row-name">
                    <strong title={entry.nickname}>{entry.nickname}</strong>
                    {general && <small>{RECIPE_LABELS[entry.recipeId]}</small>}
                  </span>
                  <span className="cn-board-row-score">
                    {number.format(entry.score)}
                    <small>pts</small>
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p className="cn-board-count">
            <span>{data.total > limit ? `Top ${limit}` : 'Au tableau'}</span>
            {number.format(data.total)} partie{data.total > 1 ? 's' : ''} réussie
            {data.total > 1 ? 's' : ''}
          </p>
        </>
      )}
      {data.status === 'error' && hasEntries && (
        <p className="cn-board-stale" role="status">
          Actualisation interrompue. Les derniers scores chargés restent affichés.
        </p>
      )}
      {selected && (
        <aside
          className="cn-board-player"
          aria-label={`Votre partie est à la place ${selected.rank}`}
        >
          <span className="cn-board-player-rank">#{number.format(selected.rank)}</span>
          <span className="cn-board-player-name">
            <small>VOTRE PLACE</small>
            <strong title={selected.entry.nickname}>{selected.entry.nickname}</strong>
          </span>
          <span className="cn-board-player-score">
            {number.format(selected.entry.score)}
            <small>pts</small>
          </span>
        </aside>
      )}
    </article>
  );
}
