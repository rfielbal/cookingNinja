import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { ArrowRight, Check, Pause, RotateCcw, Sparkles } from 'lucide-react';
import type { MotionInput } from '../net';
import { PracticeScene } from '../game/PracticeScene';
import { PracticeLesson, PRACTICE_TRAP_SECONDS } from '../game/practice';
import { FOODS, RECIPES, type Recipe } from '../game/recipes';
import './practice.css';

function lessonView(lesson: PracticeLesson) {
  return {
    step: lesson.step,
    phase: lesson.phase,
    feedback: lesson.feedback,
    completed: lesson.completed,
    kind: lesson.target.kind,
  };
}

/** Optional, scoreless practice using the recipe's actual models and input coordinates. */
export function PracticeRange({
  inputRef,
  ready,
  source,
  busy,
  onBegin,
  onClose,
  recipe = RECIPES[0],
  lowQuality = false,
}: {
  inputRef: MutableRefObject<((input: MotionInput) => void) | null>;
  ready: boolean;
  source: 'motion' | 'touch';
  busy: boolean;
  onBegin: () => void;
  onClose: () => void;
  recipe?: Recipe;
  lowQuality?: boolean;
}) {
  const [view, setView] = useState(() => lessonView(new PracticeLesson(recipe, source)));
  const [sceneError, setSceneError] = useState(false);
  const [visible, setVisible] = useState(() => !document.hidden);
  const element = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const reticle = useRef<HTMLSpanElement>(null);
  const passage = useRef<HTMLProgressElement>(null);
  const controls = useRef({ ready, source, busy });
  controls.current = { ready, source, busy };

  useEffect(() => {
    const host = canvasHost.current;
    const root = element.current;
    if (!host || !root) return;
    const lesson = new PracticeLesson(recipe, controls.current.source);
    setView(lessonView(lesson));
    setSceneError(false);
    let scene: PracticeScene;
    try {
      scene = new PracticeScene(
        host,
        lesson.foods,
        lowQuality,
        getComputedStyle(root).getPropertyValue('--blade-color').trim() || '#ffd090',
      );
    } catch {
      setSceneError(true);
      return;
    }
    let width = 1,
      height = 1;
    let stopped = false,
      frame = 0;
    let hidden = document.hidden,
      lostContext = false,
      redraw = true;
    let last = performance.now(),
      lastRender = last,
      publishedRevision = -1;
    let cursor = { x: 0.5, y: 0.5, slash: false, at: -Infinity };
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => {
      scene.setReducedMotion(reducedMotion.matches);
      redraw = true;
    };
    updateMotion();
    reducedMotion.addEventListener('change', updateMotion);
    const syncReadiness = () => {
      const current = controls.current;
      const enabled = current.ready && !current.busy && !hidden && !lostContext;
      lesson.setSource(current.source);
      if (enabled !== lesson.enabled) {
        lesson.setEnabled(enabled);
        scene.clearGesture();
        cursor.at = -Infinity;
        redraw = true;
      }
      return enabled;
    };
    const resize = () => {
      const bounds = root.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      lesson.resize(width, height);
      scene.resize(width, height);
      cursor.at = -Infinity;
      redraw = true;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    resize();
    const receive = (packet: MotionInput) => {
      if (!syncReadiness() || stopped) return;
      const now = performance.now();
      if ((packet.source ?? 'motion') !== controls.current.source) return;
      cursor = { x: packet.x, y: packet.y, slash: packet.slash, at: now };
      const result = lesson.receive(packet, now);
      if (result.segment) scene.slash(result.segment);
      if (result.feedback) scene.burst(lesson.target, result.feedback === 'mistake');
    };
    inputRef.current = receive;
    const onVisibility = () => {
      hidden = document.hidden;
      setVisible(!hidden);
      syncReadiness();
      last = lastRender = performance.now();
      redraw = true;
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      lostContext = true;
      syncReadiness();
      setSceneError(true);
    };
    const canvas = host.querySelector('canvas');
    canvas?.addEventListener('webglcontextlost', onContextLost);
    document.addEventListener('visibilitychange', onVisibility);
    const loop = (now: number) => {
      if (stopped) return;
      const enabled = syncReadiness();
      const dt = enabled ? Math.min(0.1, Math.max(0, (now - last) / 1000)) : 0;
      last = now;
      lesson.tick(dt);
      if (lesson.revision !== publishedRevision) {
        publishedRevision = lesson.revision;
        setView(lessonView(lesson));
        redraw = true;
      }
      if (passage.current) passage.current.value = lesson.trapElapsed / PRACTICE_TRAP_SECONDS;
      if (reticle.current) {
        reticle.current.style.opacity =
          enabled && lesson.phase === 'active' && now - cursor.at < 500 ? '1' : '0';
        reticle.current.style.transform = `translate(${cursor.x * width}px, ${cursor.y * height}px) translate(-50%, -50%)`;
        reticle.current.classList.toggle('is-cutting', cursor.slash);
      }
      if (
        !hidden &&
        !lostContext &&
        (redraw || (enabled && now - lastRender >= (lowQuality ? 32 : 15)))
      ) {
        scene.render(lesson.target, enabled ? Math.min(0.1, (now - lastRender) / 1000) : 0);
        lastRender = now;
        redraw = false;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      reducedMotion.removeEventListener('change', updateMotion);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas?.removeEventListener('webglcontextlost', onContextLost);
      if (inputRef.current === receive) inputRef.current = null;
      scene.dispose();
    };
  }, [inputRef, recipe, lowQuality]);

  const available = ready && visible && !busy && !sceneError;
  const complete = view.phase === 'complete';
  const foodName = FOODS[view.kind].name;
  const title = sceneError
    ? 'L’aperçu 3D est indisponible.'
    : complete
      ? 'Vous avez le bon réflexe !'
      : view.feedback === 'mistake'
        ? 'Pas dans la recette.'
        : view.feedback === 'cut'
          ? 'Bien vu, chef !'
          : view.feedback === 'avoided'
            ? 'Le piège est passé !'
            : view.step === 2
              ? `Laissez passer : ${foodName.toLowerCase()}`
              : `Coupez : ${foodName.toLowerCase()}`;
  const explanation = sceneError
    ? 'Revenez à la préparation pour réessayer, ou passez cet essai.'
    : complete
      ? 'Les bons ingrédients seulement. Vous êtes prêt pour la recette.'
      : view.feedback === 'mistake'
        ? 'Aucun cœur perdu. Laissez-le passer au prochain essai.'
        : view.feedback === 'cut'
          ? `${foodName} : c’est bien un ingrédient de cette recette.`
          : view.feedback === 'avoided'
            ? 'Savoir attendre, c’est aussi un geste de ninja.'
            : view.step === 2
              ? 'Cet aliment n’est pas dans la recette. Ne le coupez pas.'
              : 'C’est un des bons ingrédients. Traversez-le avec votre lame.';
  return (
    <div className="ninja-practice" ref={element} data-phase={view.phase}>
      <div className="ninja-practice-canvas" ref={canvasHost} />
      <div className="ninja-practice-heading">
        <p className="ninja-practice-eyebrow">ESSAI LIBRE · {recipe.name}</p>
        <ol
          className="ninja-practice-steps"
          aria-label={`${view.completed} ${view.completed === 1 ? 'étape sur 3 réussie' : 'étapes sur 3 réussies'}`}
        >
          {['Couper', 'Couper', 'Éviter'].map((label, index) => (
            <li
              key={index}
              className={
                index < view.completed ? 'is-done' : view.step === index ? 'is-current' : ''
              }
              aria-current={!complete && view.step === index ? 'step' : undefined}
            >
              <span>{index < view.completed ? <Check size={13} /> : index + 1}</span> {label}
            </li>
          ))}
        </ol>
        <div
          role="status"
          aria-live="polite"
          className={view.feedback === 'mistake' ? 'is-mistake' : ''}
        >
          <h2>{title}</h2>
          <p>{explanation}</p>
        </div>
      </div>
      {!available && !sceneError && !busy && (
        <div className="ninja-practice-pause" role="status">
          <Pause size={20} />
          <span>Essai en pause. Reprenez la commande sur votre téléphone.</span>
        </div>
      )}
      {complete && !sceneError && (
        <div className="ninja-practice-finish" aria-hidden="true">
          <Sparkles size={23} />
          <Check size={53} />
          <Sparkles size={18} />
        </div>
      )}
      <span className="ninja-practice-reticle" ref={reticle} aria-hidden="true" />
      <div className="ninja-practice-bottom">
        {view.step === 2 && view.phase === 'active' ? (
          <div className="ninja-practice-passage">
            <span>LAISSEZ-LE SORTIR</span>
            <progress ref={passage} max={1} value={0} aria-label="Passage du piège" />
          </div>
        ) : (
          <p className="ninja-practice-hint">
            {complete
              ? 'Lancez sur le téléphone ou ici.'
              : source === 'touch'
                ? 'Glissez le doigt sur le pavé du téléphone.'
                : 'Inclinez pour viser, puis donnez un petit coup de poignet.'}
          </p>
        )}
        <div className="ninja-practice-actions">
          <button className="ninja-practice-back" onClick={onClose} disabled={busy}>
            <RotateCcw size={15} /> Retour
          </button>
          <button
            className={`ninja-practice-start ${complete ? 'is-complete' : ''}`}
            disabled={!ready || busy}
            onClick={onBegin}
          >
            {busy ? 'Préparation…' : complete ? 'C’est parti !' : 'Passer l’essai'}
            <ArrowRight size={18} />
          </button>
        </div>
        <span className="ninja-practice-safe">Aucun score · aucun cœur en jeu</span>
      </div>
    </div>
  );
}
