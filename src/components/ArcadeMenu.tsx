import { useEffect, type RefObject } from 'react';
import { ArrowLeft, ArrowRight, ChefHat, Heart, Play, Trophy } from 'lucide-react';
import { RECIPES, FOODS, type Recipe } from '../game/recipes';
import { audio } from '../game/audio';
import { DishArt } from './DishArt';

interface Props {
  screen: 'home' | 'recipes';
  recipe: Recipe;
  onRecipe: (r: Recipe) => void;
  onPlay: () => void;
  onBoard: () => void;
  onHelp: () => void;
  onBack: () => void;
  nickname: string;
  onNickname: (value: string) => void;
  sceneRef: RefObject<HTMLDivElement | null>;
  sceneError: string;
  keyboardEnabled: boolean;
}
export function ArcadeMenu(p: Props) {
  const index = RECIPES.indexOf(p.recipe);
  const validNickname = /^[\p{L}\p{N} ._'’-]{2,20}$/u.test(p.nickname.trim().normalize('NFKC'));
  const select = (recipe: Recipe) => {
    if (recipe.id === p.recipe.id) return;
    audio.unlock();
    audio.play('select');
    p.onRecipe(recipe);
  };
  const change = (direction: number) =>
    select(RECIPES[(index + direction + RECIPES.length) % RECIPES.length]);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (
        !p.keyboardEnabled ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLButtonElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        change(-1);
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        change(1);
      }
      if (e.key === 'Enter' && (p.screen === 'home' || validNickname)) {
        e.preventDefault();
        p.onPlay();
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  });
  return (
    <main className={`arcade-menu menu-${p.screen}`}>
      <div className="arcade-copy">
        <span className="arcade-kicker">
          <span /> LE DOJO DES SAVEURS
        </span>
        {p.screen === 'home' ? (
          <>
            <h1>
              À vos gestes,
              <br />
              <em>chefs !</em>
            </h1>
            <p className="arcade-intro">
              Votre téléphone devient votre sabre.
              <br />
              La bonne recette. Le bon geste. Le meilleur score.
            </p>
            <div className="arcade-rules">
              <span>
                01 <b>Tranchez</b>
              </span>
              <span>
                02 <b>Mélangez</b>
              </span>
              <span>
                03 <b>Régalez</b>
              </span>
            </div>
            <button className="arcade-start" onClick={p.onPlay}>
              <Play fill="currentColor" size={24} /> Jouer <span>↵</span>
            </button>
            <div className="arcade-secondary">
              <button onClick={p.onBoard}>
                <Trophy size={18} /> Classement
              </button>
              <button onClick={p.onHelp}>Comment jouer ?</button>
            </div>
          </>
        ) : (
          <>
            <button className="arcade-back" onClick={p.onBack}>
              <ArrowLeft size={16} /> Accueil
            </button>
            <h1>
              À vous de
              <br />
              <em>choisir.</em>
            </h1>
            <div className="dojo-steps" aria-label="Préparation de la partie">
              <span className="active">01 · Recette & pseudo</span>
              <span>02 · Préparez votre sabre</span>
              <span>03 · Lancez sur le téléphone</span>
            </div>
            <label className="nickname-field">
              Votre pseudo
              <input
                maxLength={20}
                minLength={2}
                value={p.nickname}
                onChange={(e) => p.onNickname(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                aria-describedby="nickname-note"
              />
            </label>
            <small id="nickname-note">
              Visible au classement. 2–20 lettres ou chiffres, sans nom complet.
            </small>
            <button className="arcade-start" disabled={!validNickname} onClick={p.onPlay}>
              Préparer cette recette <ArrowRight size={22} />
            </button>
            <p className="arcade-small">
              Connectez votre téléphone, choisissez votre lame. À vous de lancer !
            </p>
          </>
        )}
      </div>
      <div className="arcade-stage">
        <div className="arcade-orbit" />
        <span className="stage-star star-a">✦</span>
        <span className="stage-star star-b">✧</span>
        <div className="arcade-scene" ref={p.sceneRef} />
        {p.sceneError && (
          <p className="scene-error" role="alert">
            {p.sceneError}
          </p>
        )}
        <span className="stage-time">
          80 s de découpe
          <br />
          <strong>8 s de mélange</strong>
        </span>
        <span className="stage-hearts">
          <Heart fill="currentColor" size={18} />
          <Heart fill="currentColor" size={18} />
          <Heart fill="currentColor" size={18} />
        </span>
        <div className="recipe-selector">
          <button aria-label="Recette précédente" onClick={() => change(-1)}>
            <ArrowLeft />
          </button>
          <div key={p.recipe.id} aria-live="polite">
            <small>
              RECETTE 0{index + 1} · {p.recipe.difficulty.toUpperCase()}
            </small>
            <h2>{p.recipe.name}</h2>
          </div>
          <button aria-label="Recette suivante" onClick={() => change(1)}>
            <ArrowRight />
          </button>
        </div>
        {p.screen === 'recipes' && (
          <div className="menu-ingredients">
            {p.recipe.ingredients.map((k) => (
              <span key={k} title={FOODS[k].name}>
                {FOODS[k].emoji}
                <small>{FOODS[k].name}</small>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="arcade-bottom">
        <div className="recipe-tokens" aria-label="Choix de la recette">
          {RECIPES.map((r, i) => (
            <button
              key={r.id}
              aria-pressed={r.id === p.recipe.id}
              className={r.id === p.recipe.id ? 'selected' : ''}
              onClick={() => select(r)}
            >
              <span>0{i + 1}</span>
              <DishArt recipe={r.id} />
              <strong>{r.name}</strong>
            </button>
          ))}
        </div>
        <p>
          <ChefHat size={20} />
          <span>
            Un projet à jouer.
            <br />
            <strong>Un métier à découvrir.</strong>
          </span>
        </p>
      </div>
    </main>
  );
}
