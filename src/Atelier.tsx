import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChefHat,
  Code2,
  Crosshair,
  Heart,
  Monitor,
  Pause,
  Play,
  QrCode,
  Radio,
  RotateCcw,
  Salad,
  Scissors,
  Server,
  ShieldCheck,
  Smartphone,
  Soup,
  Trophy,
  Zap,
} from 'lucide-react';
import { ATELIER_SLIDES, type AtelierStep } from './atelierSlides';
import { AtelierStage } from './components/AtelierStage';
import { AtelierCodeLab } from './components/AtelierCodeLab';
import './atelier.css';

const icons = [Smartphone, Radio, Salad, Scissors, Soup, Trophy];
type Variant = 'normal' | 'frenzy' | 'trap' | 'shield';
function initialSlide() {
  return Math.max(
    0,
    ATELIER_SLIDES.findIndex((slide) => location.hash === `#atelier-${slide.id}`),
  );
}

function DemoPhone() {
  return (
    <div className="atelier-gesture-phone" aria-hidden="true">
      <div className="atelier-phone-orbit">
        <ArrowLeft />
        <ArrowRight />
      </div>
      <div className="atelier-phone-grip">
        <div className="atelier-hand" />
        <div className="atelier-phone">
          <div className="atelier-phone-camera" />
          <ChefHat size={24} />
          <span className="atelier-phone-brand">
            cooking<b>ninja</b>
          </span>
          <div className="atelier-phone-pad">
            <Crosshair size={32} />
          </div>
          <div className="atelier-phone-ready">
            <span /> Gyroscope
          </div>
        </div>
      </div>
      <span className="atelier-object-label">Votre téléphone</span>
    </div>
  );
}

function NetworkDemo({ action }: { action: number }) {
  return (
    <div className="atelier-network" key={action} aria-hidden="true">
      <div className="atelier-pair-label">
        <QrCode size={22} /> Le QR relie les deux écrans
      </div>
      <div className="atelier-network-flow">
        <div className="atelier-network-node">
          <Smartphone />
          <strong>Téléphone</strong>
          <span>Le geste</span>
        </div>
        <div className="atelier-wire">
          <i />
          <span>Visée + coupe</span>
        </div>
        <div className="atelier-network-node is-server">
          <Server />
          <strong>Relais</strong>
          <span>Le bon salon</span>
        </div>
        <div className="atelier-wire is-second">
          <i />
          <span>Message vérifié</span>
        </div>
        <div className="atelier-network-node">
          <Monitor />
          <strong>PC</strong>
          <span>La lame bouge</span>
        </div>
      </div>
      <div className="atelier-network-note">
        <span /> Une connexion reste ouverte pendant le jeu.
      </div>
    </div>
  );
}

function SceneOverlay({
  step,
  hit,
  variant,
  action,
}: {
  step: AtelierStep;
  hit: boolean;
  variant: Variant;
  action: number;
}) {
  if (step === 'gesture')
    return (
      <>
        <DemoPhone />
        <div className="atelier-target-label">
          <Crosshair size={18} /> La visée sur le PC
        </div>
        <div className={`atelier-gesture-hit ${hit ? 'is-visible' : ''}`}>
          <Scissors size={18} /> Le geste rapide coupe !
        </div>
      </>
    );
  if (step === 'network') return <NetworkDemo action={action} />;
  if (step === 'flight')
    return (
      <>
        <div className={`atelier-speed-tag ${variant === 'frenzy' ? 'is-frenzy' : ''}`}>
          <Zap size={18} />
          {variant === 'frenzy' ? 'Frénésie · le vol accélère' : 'Les aliments du Ninja Burger'}
        </div>
        <div className="atelier-flight-floor" />
        <div className="atelier-scene-caption">Le code change leur position à chaque image.</div>
      </>
    );
  if (step === 'slice')
    return (
      <>
        <div className="atelier-demo-hud">
          <span className="atelier-demo-hearts">
            {[0, 1, 2].map((heart) => (
              <Heart
                key={heart}
                size={25}
                fill="currentColor"
                className={hit && variant === 'trap' && heart === 2 ? 'is-lost' : ''}
              />
            ))}
          </span>
          <strong>
            {hit && variant === 'normal' ? '100' : '0'} <small>pts</small>
          </strong>
        </div>
        {variant === 'shield' && (
          <div className="atelier-shield-label">
            <ShieldCheck size={20} /> Bouclier actif
          </div>
        )}
        <div
          className={`atelier-hit-result ${hit ? 'is-visible' : ''} ${variant === 'trap' ? 'is-error' : ''}`}
          role="status"
        >
          {hit
            ? variant === 'normal'
              ? 'Dans la recette : +100 points'
              : variant === 'shield'
                ? 'Le bouclier bloque les dégâts !'
                : 'Pas dans la recette : −1 cœur'
            : 'Choisissez un aliment, puis tranchez.'}
        </div>
      </>
    );
  if (step === 'mix')
    return (
      <>
        <svg className="atelier-stir-arrows" viewBox="0 0 300 300" aria-hidden="true">
          <defs>
            <marker
              id="stir-arrow"
              markerWidth="6"
              markerHeight="6"
              refX="4"
              refY="3"
              orient="auto"
            >
              <path d="M0 0L6 3L0 6Z" fill="currentColor" />
            </marker>
          </defs>
          <path d="M45 110 A110 85 0 0 1 240 80" markerEnd="url(#stir-arrow)" />
          <path d="M255 190 A110 85 0 0 1 60 220" markerEnd="url(#stir-arrow)" />
        </svg>
        <div className="atelier-mix-label">
          <RotateCcw size={21} /> Faites de petits cercles
        </div>
        <div className="atelier-demo-gauge">
          <span>Énergie du mélange</span>
          <div>
            <i />
          </div>
        </div>
      </>
    );
  return (
    <>
      <div className="atelier-dish-label">
        <Check size={17} /> Le plat est prêt !
      </div>
      <div className="atelier-demo-board" key={action} aria-hidden="true">
        <span className="atelier-board-eyebrow">LA PARTIE REJOINT LE</span>
        <h3>
          <Trophy size={25} /> Classement
        </h3>
        <div className="atelier-board-tabs">
          <span>Général</span>
          <span>Ninja Burger</span>
        </div>
        {[
          ['1', 'Ninja', '4 850'],
          ['2', 'Vous', '4 200'],
          ['3', 'Chef', '3 750'],
        ].map(([rank, name, score], i) => (
          <div className={`atelier-board-row ${i === 1 ? 'is-you' : ''}`} key={rank}>
            <span>{rank}</span>
            <strong>{name}</strong>
            <b>{score}</b>
          </div>
        ))}
        <small>Scores d’illustration</small>
      </div>
    </>
  );
}

export default function Atelier() {
  const [index, setIndex] = useState(initialSlide);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const [reducedMotion, setReducedMotion] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [codeOpen, setCodeOpen] = useState(false);
  const codeButton = useRef<HTMLButtonElement>(null);
  const closeCode = () => {
    setCodeOpen(false);
    requestAnimationFrame(() => codeButton.current?.focus({ preventScroll: true }));
  };
  const [action, setAction] = useState(0);
  const [variant, setVariant] = useState<Variant>('normal');
  const [hit, setHit] = useState(false);
  const hitRef = useRef(false);
  const demoRef = useRef<HTMLDivElement>(null);
  const current = ATELIER_SLIDES[index];
  const stepRef = useRef(current.id);
  stepRef.current = current.id;
  const StepIcon = icons[index];
  const effectivePaused = paused || hidden || codeOpen;

  const select = useCallback((next: number) => {
    const bounded = Math.max(0, Math.min(ATELIER_SLIDES.length - 1, next));
    setIndex(bounded);
    setVariant('normal');
    setAction(0);
    setHit(false);
    hitRef.current = false;
    history.replaceState(null, '', `#atelier-${ATELIER_SLIDES[bounded].id}`);
    if (window.innerWidth <= 900) window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => setReducedMotion(media.matches);
    const visibility = () => setHidden(document.hidden);
    const hash = () => select(initialSlide());
    media.addEventListener('change', motion);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('hashchange', hash);
    const previousTitle = document.title;
    document.title = 'Les coulisses du jeu · CookingNinja';
    return () => {
      media.removeEventListener('change', motion);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('hashchange', hash);
      document.title = previousTitle;
    };
  }, [select]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        codeOpen ||
        event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        (event.target instanceof HTMLElement &&
          event.target.closest('input,textarea,select,[contenteditable]'))
      )
        return;
      if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        select(
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? ATELIER_SLIDES.length - 1
              : index + (event.key === 'ArrowRight' ? 1 : -1),
        );
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [index, codeOpen, select]);

  const onFrame = useCallback((frame: { progress: number; hit: boolean; phase: string }) => {
    demoRef.current?.style.setProperty(
      '--demo-tilt',
      `${Math.sin(frame.progress * Math.PI * 2) * 24}deg`,
    );
    demoRef.current?.style.setProperty('--demo-progress', `${frame.progress}`);
    // Keep the outcome readable after the brief cut animation has finished.
    const nextHit = frame.hit || (stepRef.current === 'slice' && hitRef.current);
    if (nextHit !== hitRef.current) {
      hitRef.current = nextHit;
      setHit(nextHit);
    }
  }, []);
  const replay = () => {
    setPaused(false);
    setHit(false);
    hitRef.current = false;
    setAction((value) => value + 1);
  };
  const chooseVariant = (next: Variant) => {
    setVariant(next);
    setHit(false);
    hitRef.current = false;
  };
  const replayLabel =
    current.id === 'slice'
      ? 'Trancher !'
      : current.id === 'mix'
        ? 'Mélanger !'
        : current.id === 'network'
          ? 'Envoyer un geste'
          : 'Rejouer la démo';

  return (
    <div className="atelier-deck">
      <header className="atelier-deck-header">
        <a className="atelier-deck-brand" href="/" aria-label="CookingNinja, ouvrir le jeu">
          <span>
            <ChefHat size={25} />
          </span>
          <strong>
            cooking<b>ninja</b>
          </strong>
        </a>
        <div className="atelier-school">
          <span>UN PROJET DU</span>
          <strong>Lycée Guy Mollet</strong>
          <span>ARRAS · BTS SIO</span>
        </div>
        <a className="atelier-back-link" href="/">
          <ArrowLeft size={17} />
          <span>Le jeu</span>
        </a>
      </header>
      <main
        className="atelier-deck-main"
        id="atelier-decouverte"
        aria-label="Les coulisses de CookingNinja"
      >
        <section
          className="atelier-slide"
          aria-roledescription="diapositive"
          aria-label={`${index + 1} sur ${ATELIER_SLIDES.length} : ${current.label}`}
        >
          <div className="atelier-story" key={current.id}>
            <div className="atelier-story-eyebrow">
              <span>{String(index + 1).padStart(2, '0')}</span>
              {current.eyebrow.replace(/^\d+ · /, '')}
            </div>
            <div aria-live="polite" aria-atomic="true">
              <h1>{current.title}</h1>
              <p className="atelier-lead">{current.lead}</p>
            </div>
            <div className="atelier-takeaway">
              <StepIcon size={23} />
              <p>{current.takeaway}</p>
            </div>
            <button
              ref={codeButton}
              className="atelier-code-button"
              onClick={() => setCodeOpen(true)}
            >
              <Code2 size={19} /> Voir le code de cette étape <ArrowUpRight size={17} />
            </button>
            <span className="atelier-story-note">Les coulisses du jeu, à votre rythme.</span>
          </div>
          <div className={`atelier-demo-shell ${variant === 'frenzy' ? 'is-frenzy' : ''}`}>
            <div className="atelier-demo-topline">
              <span>
                <i /> {current.id === 'network' ? 'LE TRAJET DU GESTE' : 'COMME DANS LE JEU'}
              </span>
              <button
                onClick={() => setPaused((value) => !value)}
                aria-label={paused ? 'Reprendre les animations' : 'Mettre les animations en pause'}
                aria-pressed={paused}
              >
                {paused ? <Play size={16} /> : <Pause size={16} />}
                <span>{paused ? 'Reprendre' : 'Pause'}</span>
              </button>
            </div>
            <div
              className={`atelier-demo-viewport is-${current.id} ${effectivePaused || reducedMotion ? 'is-paused' : ''}`}
              ref={demoRef}
            >
              <div className="atelier-stage-halo" />
              <AtelierStage
                step={current.id}
                paused={effectivePaused}
                reducedMotion={reducedMotion}
                action={action}
                variant={variant}
                onFrame={onFrame}
              />
              <SceneOverlay step={current.id} hit={hit} variant={variant} action={action} />
            </div>
            <div className="atelier-demo-controls">
              {current.id === 'flight' ? (
                <div className="atelier-demo-choices" aria-label="Vitesse de la démonstration">
                  <button
                    aria-pressed={variant === 'normal'}
                    onClick={() => chooseVariant('normal')}
                  >
                    Normal
                  </button>
                  <button
                    aria-pressed={variant === 'frenzy'}
                    onClick={() => chooseVariant('frenzy')}
                  >
                    <Zap size={16} /> Frénésie
                  </button>
                </div>
              ) : current.id === 'slice' ? (
                <div className="atelier-demo-choices" aria-label="Aliment et protection">
                  <button
                    aria-pressed={variant === 'normal'}
                    onClick={() => chooseVariant('normal')}
                  >
                    Tomate
                  </button>
                  <button aria-pressed={variant === 'trap'} onClick={() => chooseVariant('trap')}>
                    Poisson
                  </button>
                  <button
                    aria-pressed={variant === 'shield'}
                    onClick={() => chooseVariant('shield')}
                  >
                    <ShieldCheck size={16} /> Bouclier
                  </button>
                </div>
              ) : (
                <span className="atelier-demo-invitation">
                  {current.id === 'gesture'
                    ? 'Observez le téléphone et la lame.'
                    : current.id === 'mix'
                      ? 'À vous de faire tourner le bol.'
                      : current.id === 'result'
                        ? 'Une recette réussie peut être classée.'
                        : 'Suivez le message lumineux.'}
                </span>
              )}
              <button className="atelier-replay" onClick={replay}>
                {current.id === 'slice' ? <Scissors size={18} /> : <RotateCcw size={17} />}{' '}
                {replayLabel}
              </button>
            </div>
            <p className="atelier-demo-disclaimer">
              Démonstration illustrée ·{' '}
              {current.id === 'result'
                ? 'scores fictifs, aucun enregistrement'
                : 'aucun téléphone à connecter ici'}
            </p>
          </div>
        </section>
      </main>
      <footer className="atelier-deck-footer">
        <nav className="atelier-chapters" aria-label="Étapes du diaporama">
          {ATELIER_SLIDES.map((slide, i) => {
            const Icon = icons[i];
            return (
              <button
                key={slide.id}
                onClick={() => select(i)}
                aria-current={i === index ? 'step' : undefined}
                aria-label={`Étape ${i + 1} : ${slide.label}`}
              >
                <Icon size={19} />
                <span>{slide.label}</span>
                <i />
              </button>
            );
          })}
        </nav>
        <div className="atelier-paging">
          <button
            className="atelier-previous"
            disabled={index === 0}
            onClick={() => select(index - 1)}
            aria-label="Étape précédente"
          >
            <ArrowLeft size={21} />
          </button>
          <span>
            {String(index + 1).padStart(2, '0')} <small>/ 06</small>
          </span>
          <button
            className="atelier-next"
            onClick={() => select(index === ATELIER_SLIDES.length - 1 ? 0 : index + 1)}
          >
            {index === ATELIER_SLIDES.length - 1 ? 'Revoir' : 'Suivant'}
            <ArrowRight size={19} />
          </button>
        </div>
      </footer>
      {codeOpen && (
        <AtelierCodeLab
          key={current.id}
          slide={current}
          reducedMotion={reducedMotion}
          hidden={hidden}
          onClose={closeCode}
        />
      )}
    </div>
  );
}
