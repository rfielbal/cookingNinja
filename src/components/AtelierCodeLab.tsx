import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Code2,
  Crosshair,
  Heart,
  Monitor,
  Pause,
  Play,
  RotateCcw,
  Server,
  ShieldCheck,
  Smartphone,
  Trophy,
} from 'lucide-react';
import type { AtelierSlide } from '../atelierSlides';
import type { AtelierFrame } from '../game/AtelierScene';
import { AtelierStage } from './AtelierStage';
import { Modal } from './Modal';
import './AtelierCodeLab.css';

const repository = 'https://github.com/rfielbal/cookingNinja';

/** Small, escaped React tokens: this display never evaluates the excerpt. */
function CodeLine({ text }: { text: string }) {
  const tokens = text.split(
    /('(?:[^'\\]|\\.)*'|`[^`]*`|\b(?:const|if|else|return|new|this|si|sinon)\b|\b\d+(?:\.\d+)?\b)/g,
  );
  return (
    <>
      {tokens.map((token, index) => {
        const kind = /^['`]/.test(token)
          ? 'string'
          : /^\d/.test(token)
            ? 'number'
            : /^(const|if|else|return|new|this|si|sinon)$/.test(token)
              ? 'keyword'
              : 'plain';
        return (
          <span className={`lab-token-${kind}`} key={index}>
            {token}
          </span>
        );
      })}
    </>
  );
}

export function AtelierCodeLab({
  slide,
  reducedMotion,
  hidden,
  onClose,
}: {
  slide: AtelierSlide;
  reducedMotion: boolean;
  hidden: boolean;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(0);
  const [action, setAction] = useState(0);
  const [paused, setPaused] = useState(false);
  const [shield, setShield] = useState(false);
  const [hit, setHit] = useState(false);
  const visualRef = useRef<HTMLDivElement>(null);
  const step = slide.codeSteps[selected];
  const variant = slide.id === 'slice' && selected === 2 ? (shield ? 'shield' : 'trap') : 'normal';
  const onFrame = useCallback((frame: AtelierFrame) => {
    visualRef.current?.style.setProperty('--lab-progress', String(frame.progress));
    visualRef.current?.style.setProperty(
      '--lab-tilt',
      `${Math.sin(frame.progress * Math.PI * 2) * 18}deg`,
    );
    setHit((previous) => (previous === frame.hit ? previous : frame.hit));
  }, []);
  function select(index: number) {
    setSelected(Math.max(0, Math.min(slide.codeSteps.length - 1, index)));
    setHit(false);
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      setSelected((value) =>
        Math.max(
          0,
          Math.min(slide.codeSteps.length - 1, value + (event.key === 'ArrowRight' ? 1 : -1)),
        ),
      );
      setHit(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slide]);
  return (
    <Modal title={slide.codeTitle} onClose={onClose} className="atelier-code-lab">
      <div>
        <header className="lab-heading">
          <span className="lab-eyebrow">
            <Code2 size={17} /> LES COULISSES · {slide.label}
          </span>
          <h2>{slide.codeTitle}</h2>
          <span className="lab-kind">
            {slide.codeKind === 'extrait' ? 'Vrai code du projet' : 'Version simplifiée'} ·{' '}
            {slide.language === 'typescript' ? 'TypeScript' : 'Pseudo-code'}
          </span>
        </header>
        <nav className="lab-steps" aria-label="Lecture du code, étape par étape">
          {slide.codeSteps.map((item, index) => (
            <button
              key={item.label}
              aria-current={selected === index ? 'step' : undefined}
              onClick={() => select(index)}
            >
              <b>{String(index + 1).padStart(2, '0')}</b>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="lab-workbench">
          <section className="lab-code" aria-label="Extrait de code">
            <div className="lab-pane-heading">
              <Code2 size={15} />
              <span>{slide.sourceFile.split('/').pop()}</span>
              <small>{slide.code.split('\n').length} lignes</small>
            </div>
            <pre>
              <code>
                {slide.code.split('\n').map((line, index) => (
                  <span
                    className={`lab-code-line ${step.lines.includes(index + 1) ? 'is-active' : ''}`}
                    key={index}
                  >
                    <span className="lab-line-number" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span className="lab-line-content">
                      <CodeLine text={line || ' '} />
                    </span>
                  </span>
                ))}
              </code>
            </pre>
            <span className="lab-source-label">{slide.sourceLabel}</span>
          </section>
          <section className="lab-preview" aria-label="Illustration du code sélectionné">
            <div className="lab-pane-heading">
              <span className="lab-live-dot" />À L’ÉCRAN
              <button
                onClick={() => setPaused(!paused)}
                aria-label={paused ? 'Animer l’aperçu' : 'Mettre l’aperçu en pause'}
              >
                {paused ? <Play size={16} /> : <Pause size={16} />}
              </button>
              <button
                onClick={() => {
                  setPaused(false);
                  setAction(action + 1);
                }}
                aria-label="Rejouer l’aperçu"
              >
                <RotateCcw size={16} />
              </button>
            </div>
            <div
              ref={visualRef}
              className={`lab-visual is-${slide.id} lab-step-${selected} ${paused || hidden || reducedMotion ? 'is-still' : ''}`}
            >
              {slide.id !== 'network' && (
                <AtelierStage
                  step={slide.id}
                  codeStep={selected}
                  paused={paused || hidden}
                  reducedMotion={reducedMotion}
                  action={action}
                  variant={variant}
                  onFrame={onFrame}
                />
              )}
              {slide.id === 'gesture' && (
                <div className="lab-phone" aria-hidden="true">
                  <Smartphone />
                  <span>
                    {selected === 0
                      ? 'Gauche ↔ droite'
                      : selected === 1
                        ? 'Haut ↕ bas'
                        : 'Visée lissée'}
                  </span>
                  <Crosshair className="lab-phone-target" />
                </div>
              )}
              {slide.id === 'network' && (
                <div className="lab-network" key={action} aria-hidden="true">
                  <div className="lab-network-nodes">
                    <Smartphone />
                    <i className={selected === 2 ? 'is-sending' : ''} />
                    <Server />
                    <i className={selected === 2 ? 'is-sending' : ''} />
                    <Monitor />
                  </div>
                  <div className="lab-packet" key={selected}>
                    {selected === 0 ? (
                      <>
                        <b>x : 0.6</b>
                        <b>y : 0.4</b>
                        <b>slash : true</b>
                      </>
                    ) : (
                      <code>
                        {'{"type":"input",'}
                        <br />
                        {'"x":0.6,"y":0.4,"slash":true}'}
                      </code>
                    )}
                  </div>
                  <span>
                    {selected === 0
                      ? 'Un objet qui décrit le geste'
                      : selected === 1
                        ? 'Le même geste, en texte JSON'
                        : 'Téléphone → relais → PC'}
                  </span>
                </div>
              )}
              {slide.id === 'flight' && (
                <div className="lab-observation">
                  {
                    ['vitesse verticale ↓', 'position = position + déplacement', 'rotation ↻'][
                      selected
                    ]
                  }
                </div>
              )}
              {slide.id === 'slice' && (
                <>
                  <div className="lab-hearts" aria-hidden="true">
                    {[0, 1, 2].map((i) => (
                      <Heart
                        key={i}
                        className={i === 2 && selected === 2 && !shield && hit ? 'is-lost' : ''}
                        fill="currentColor"
                      />
                    ))}
                  </div>
                  <div className="lab-observation">
                    {selected === 0
                      ? 'La lame croise l’aliment'
                      : selected === 1
                        ? hit
                          ? '+1 tomate · +100 points'
                          : 'Tomate → recette du burger'
                        : shield
                          ? 'Bouclier actif · cœur protégé'
                          : hit
                            ? '−1 cœur'
                            : 'Poisson → hors recette'}
                  </div>
                </>
              )}
              {slide.id === 'mix' && (
                <div className="lab-mix-result">
                  {selected === 0 ? (
                    <>
                      <span>Seuil de réussite : 35 %</span>
                      <div className="lab-meter">
                        <i />
                        <b />
                      </div>
                    </>
                  ) : selected === 1 ? (
                    <strong>
                      60 % × 500 = <em>300 pts</em>
                    </strong>
                  ) : (
                    <strong>
                      <Check /> Recette réussie
                    </strong>
                  )}
                </div>
              )}
              {slide.id === 'result' && (
                <div className="lab-board">
                  <span>
                    <Trophy size={16} />
                    {selected === 0 ? 'Toutes les recettes' : 'Ninja Burger'}
                  </span>
                  {['Ninja', 'Vous', 'Chef'].map((name, i) => (
                    <div key={name} className={i === 1 && selected === 2 ? 'is-you' : ''}>
                      <b>{i + 1}</b>
                      {name}
                      <strong>{['4 850', '4 200', '3 750'][i]}</strong>
                    </div>
                  ))}
                  <small>Scores fictifs</small>
                </div>
              )}
            </div>
            {slide.id === 'slice' && selected === 2 && (
              <button
                className="lab-shield-toggle"
                aria-pressed={shield}
                onClick={() => {
                  setShield(!shield);
                  setAction(action + 1);
                }}
              >
                <ShieldCheck size={16} />
                {shield ? 'Retirer le bouclier' : 'Essayer avec le bouclier'}
              </button>
            )}
            <p className="lab-visual-caption">{step.visual}</p>
          </section>
        </div>
        <div className="lab-explanation" aria-live="polite" aria-atomic="true">
          <span>{String(selected + 1).padStart(2, '0')}</span>
          <div>
            <h3>{step.label}</h3>
            <p>{step.explanation}</p>
          </div>
          <div className="lab-paging">
            <button
              disabled={selected === 0}
              onClick={() => select(selected - 1)}
              aria-label="Ligne précédente"
            >
              <ArrowLeft size={20} />
            </button>
            <button
              disabled={selected === slide.codeSteps.length - 1}
              onClick={() => select(selected + 1)}
              aria-label="Ligne suivante"
            >
              <ArrowRight size={20} />
            </button>
          </div>
        </div>
        <details className="lab-sources">
          <summary>Voir les sources et les détails de l’extrait</summary>
          <p>{slide.explanation}</p>
          <div>
            {slide.files.map((file) => (
              <a
                key={file}
                href={`${repository}/blob/main/${file}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {file}
                <ArrowUpRight size={16} />
              </a>
            ))}
          </div>
        </details>
      </div>
    </Modal>
  );
}
