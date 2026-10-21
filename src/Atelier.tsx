import { useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Box,
  Check,
  ChevronDown,
  Code2,
  Crosshair,
  GraduationCap,
  Layers3,
  Monitor,
  RotateCcw,
  Route,
  ShieldCheck,
  Smartphone,
  Terminal,
  Wifi,
} from 'lucide-react';
import { MotionTracker } from './motion';
import './atelier.css';

const blocks = [
  {
    id: 'phone',
    title: 'Le téléphone',
    subtitle: 'Observer le geste',
    icon: Smartphone,
    tag: 'CAPTEURS · TYPESCRIPT',
    files: ['src/Controller.tsx', 'src/motion.ts'],
    responsibility:
      'Le navigateur reçoit les angles et la vitesse de rotation. MotionTracker transforme ces mesures en une visée relative, puis détecte les gestes rapides.',
    input: 'Orientation β / γ et vitesse de rotation.',
    output: 'x, y entre 0 et 1 ; coupe ; énergie de mélange.',
    exampleTitle: 'La calibration attend des mesures stables.',
    code: 'if (!this.calibrationStatus(time).ready || !this.latest)\n  return false;\nconst poses = this.history.filter(\n  (pose) => time - pose.time <= CALIBRATION_WINDOW_MS + 100\n);',
    explanation:
      'Le module vérifie la stabilité et la fraîcheur des mesures, puis moyenne les angles pour fixer le centre. Le téléphone reste dans une position confortable ; sa position dans la pièce n’est pas mesurée.',
    oral: '« Je transforme l’inclinaison du téléphone en coordonnées de visée. Une rotation rapide déclenche la lame. »',
  },
  {
    id: 'relay',
    title: 'Le relais',
    subtitle: 'Acheminer le message',
    icon: Wifi,
    tag: 'NODE.JS · WEBSOCKET',
    files: ['server/relay.ts', 'shared/protocol.ts', 'src/net.ts'],
    responsibility:
      'Le serveur associe un PC à un téléphone grâce au code de salon. Il valide les messages et transmet les commandes au bon écran, sans calculer la physique du jeu.',
    input: 'Un message JSON envoyé par le téléphone appairé.',
    output: 'Le même message validé, livré au PC du salon.',
    exampleTitle: 'Chaque entrée possède un numéro croissant.',
    code: 'if (message.seq <= client.lastSequence) return;\nclient.lastSequence = message.seq;\nsend(client.room.host, message);',
    explanation:
      'Le numéro seq évite de réappliquer une entrée ancienne. Les valeurs, le rôle de l’émetteur, l’origine et la fréquence sont aussi contrôlés.',
    oral: '« Le QR code ouvre la bonne manette. WebSocket garde ensuite une connexion ouverte pour envoyer les gestes. »',
  },
  {
    id: 'engine',
    title: 'Les règles',
    subtitle: 'Décider du résultat',
    icon: Code2,
    tag: 'MOTEUR · TYPESCRIPT',
    files: ['src/game/engine.ts', 'src/game/recipes.ts'],
    responsibility:
      'GameEngine gère les ingrédients attendus, les cœurs, le score et les phases. Il reçoit l’identifiant de l’aliment touché et décide si cette coupe est correcte.',
    input: 'Le temps écoulé, une coupe identifiée ou l’énergie de mélange.',
    output: 'Un état de partie : cœurs, compteurs, score, phase.',
    exampleTitle: 'Un ingrédient piège retire un cœur.',
    code: "s.hearts--;\ns.mistakes++;\ns.combo = 0;\ns.feedback = 'Oups… pas dans la recette !';\nif (!s.hearts) this.finish('hearts');",
    explanation:
      'Les règles sont indépendantes de React et de Three.js. On peut les tester sans navigateur, sans téléphone et sans carte graphique.',
    oral: '« Je sépare les règles du rendu : changer l’apparence d’un aliment ne change pas le calcul des cœurs. »',
  },
  {
    id: 'scene',
    title: 'La scène 3D',
    subtitle: 'Dessiner et détecter',
    icon: Box,
    tag: 'THREE.JS · WEBGL',
    files: ['src/game/Scene.ts', 'src/game/food.ts'],
    responsibility:
      'Three.js affiche les aliments et anime leurs trajectoires. La scène projette leurs positions sur l’écran, teste le passage de la lame et renvoie les identifiants touchés.',
    input: 'Les aliments à faire apparaître et le segment parcouru par la lame.',
    output: 'Une image animée et un callback onHit(id) lorsqu’un aliment est touché.',
    exampleTitle: 'Une coupe est retirée avant d’être signalée.',
    code: 'if (!this.foods.delete(food.id)) continue;\nthis.burst(food, dx / Math.sqrt(lengthSq),\n  dy / Math.sqrt(lengthSq));\nthis.arena.remove(food.object);\nthis.options.onHit?.(food.id);',
    explanation:
      'Supprimer d’abord l’identifiant empêche cette scène de compter deux fois le même aliment. Les éclats donnent l’effet de coupe ; le maillage n’est pas réellement tranché.',
    oral: '« La 3D sait quel aliment la lame traverse. Le moteur décide ensuite si cet aliment appartient à la recette. »',
  },
  {
    id: 'interface',
    title: 'L’interface',
    subtitle: 'Rendre l’état lisible',
    icon: Monitor,
    tag: 'REACT · CSS',
    files: ['src/App.tsx', 'src/components/PairDialog.tsx', 'src/styles.css'],
    responsibility:
      'React compose l’accueil, les recettes, la connexion et les résultats. App.tsx orchestre les commandes entre le relais, le moteur et la scène, puis affiche l’état de la partie.',
    input: 'L’état produit par GameEngine et les actions du joueur.',
    output: 'Des cœurs, un chronomètre, une liste d’ingrédients et un score à jour.',
    exampleTitle: 'L’interface reçoit une copie de l’état du moteur.',
    code: 'setState(game.snapshot());',
    explanation:
      'La boucle de rendu 3D reste indépendante des mises à jour de React. Les menus n’ont pas besoin d’être reconstruits à chaque image de l’animation.',
    oral: '« React affiche les menus et les informations. Three.js s’occupe des objets animés ; App.tsx relie ces deux parties. »',
  },
] as const;

const questions = [
  [
    'Pourquoi ce choix de technologies ?',
    'TypeScript est partagé entre les règles, le téléphone et le serveur. React convient aux écrans et Three.js à la scène 3D. Cela évite d’imposer une application mobile aux visiteurs. En contrepartie, il faut gérer les différences de capteurs, les permissions et le réseau.',
  ],
  [
    'Est-ce un suivi de la position du téléphone ?',
    'Non. Les angles orientent une visée relative ; le gyroscope mesure une vitesse de rotation. Le projet ne calcule pas les coordonnées physiques du téléphone dans la pièce et ne double-intègre pas l’accélération pour prétendre le faire.',
  ],
  [
    'À quoi sert HTTPS si le réseau est local ?',
    'Le navigateur protège l’accès aux capteurs. Une IP privée en HTTP ne devient pas un contexte sécurisé parce que les appareils partagent le même Wi-Fi. Un QR code ne remplace ni HTTPS ni la permission de mouvement.',
  ],
  [
    'Le classement est-il impossible à tricher ?',
    'Non. Les écritures sont réservées au poste local du stand et les résultats sont validés, mais le PC calcule encore les scores. Cette limite convient à une démonstration encadrée ; une compétition publique demanderait une autorité de jeu côté serveur.',
  ],
  [
    'Qu’est-ce qui est simulé ?',
    'Le curseur de cette page injecte des angles dans le vrai MotionTracker, sans lire de capteur. Les aliments sont des modèles procéduraux, la coupe produit des éclats et le mélange remplit une jauge. Un test synthétique ne valide pas le confort d’un téléphone réel.',
  ],
];

export default function Atelier() {
  const [selected, setSelected] = useState(0);
  const [angle, setAngle] = useState(0);
  const [anchor, setAnchor] = useState(0);
  const [position, setPosition] = useState({ x: 0.5, y: 0.5 });
  const tracker = useRef<MotionTracker | null>(null);
  const clock = useRef(0);
  const [checks, setChecks] = useState<number[]>([]);
  const current = blocks[selected];
  const Icon = current.icon;

  function model() {
    if (!tracker.current) {
      tracker.current = new MotionTracker();
      for (let i = 0; i < 9; i++) {
        clock.current += 60;
        tracker.current.orientation(0, 0, clock.current);
      }
      tracker.current.calibrate(clock.current);
    }
    return tracker.current;
  }
  function tilt(value: number) {
    setAngle(value);
    const motion = model();
    clock.current += 400;
    motion.orientation(0, value, clock.current);
    const sample = motion.sample(clock.current);
    setPosition({ x: sample.x, y: sample.y });
  }
  function calibrate() {
    const motion = model();
    motion.beginCalibration();
    // Synthetic, stable samples satisfy the same calibration checks as the controller.
    for (let i = 0; i < 9; i++) {
      clock.current += 60;
      motion.orientation(0, angle, clock.current);
    }
    if (!motion.calibrate(clock.current)) return;
    setAnchor(angle);
    setPosition({ x: 0.5, y: 0.5 });
  }
  function reset() {
    tracker.current = null;
    clock.current = 0;
    setAngle(0);
    setAnchor(0);
    setPosition({ x: 0.5, y: 0.5 });
  }

  return (
    <div className="atelier-page">
      <header className="atelier-header">
        <a className="atelier-brand" href="/" aria-label="Retour au jeu CookingNinja">
          <span>
            <Layers3 size={23} />
          </span>{' '}
          cooking<b>ninja</b>
          <em>l’atelier</em>
        </a>
        <a className="atelier-return" href="/">
          <ArrowLeft size={16} /> Retour au jeu
        </a>
      </header>
      <main>
        <section className="atelier-intro">
          <p className="atelier-eyebrow">
            <GraduationCap size={16} /> BTS SIO · LYCÉE GUY MOLLET · ARRAS
          </p>
          <h1>
            Derrière le geste,
            <br />
            <span>il y a du code.</span>
          </h1>
          <p>
            Un espace pour comprendre CookingNinja, préparer la démonstration et expliquer les choix
            du projet. Ouvrez le capot, étape par étape.
          </p>
          <nav aria-label="Dans l’atelier">
            <a href="#atelier-flow">
              Le fonctionnement <ArrowRight size={15} />
            </a>
            <a href="#atelier-calibration">Essayer la calibration</a>
            <a href="#atelier-oral">Préparer l’oral</a>
          </nav>
          <div className="atelier-intro-mark" aria-hidden="true">
            <Code2 />
            <span>
              DU GESTE
              <br />À L’IMAGE
            </span>
          </div>
        </section>

        <section id="atelier-flow" className="atelier-section">
          <div className="atelier-section-title">
            <div>
              <p className="atelier-eyebrow">01 / LES PIÈCES DU PROJET</p>
              <h2>Cinq rôles. Une seule partie.</h2>
            </div>
            <p>Sélectionnez une étape pour voir ce qu’elle fait et où la retrouver.</p>
          </div>
          <div className="atelier-flow" aria-label="Composants de CookingNinja">
            {blocks.map((block, index) => {
              const BlockIcon = block.icon;
              return (
                <button
                  key={block.id}
                  type="button"
                  className={selected === index ? 'is-active' : ''}
                  aria-pressed={selected === index}
                  aria-controls="atelier-component-detail"
                  onClick={() => setSelected(index)}
                >
                  <span className="atelier-step-index">0{index + 1}</span>
                  <BlockIcon size={25} />
                  <strong>{block.title}</strong>
                  <small>{block.subtitle}</small>
                  {index < blocks.length - 1 && (
                    <ArrowRight className="atelier-flow-arrow" size={18} aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
          <p className="atelier-flow-note">
            <Route size={16} />
            <span>
              <b>Le trajet d’une coupe :</b> téléphone → relais → App.tsx → scène 3D → règles →
              interface. Le moteur déclenche aussi l’apparition des aliments dans la scène.
            </span>
          </p>
          <article className="atelier-detail" id="atelier-component-detail" aria-live="polite">
            <div className="atelier-detail-copy">
              <div className="atelier-detail-tag">
                <Icon size={18} /> {current.tag}
              </div>
              <h3>{current.title}</h3>
              <p>{current.responsibility}</p>
              <dl>
                <div>
                  <dt>ENTRÉE</dt>
                  <dd>{current.input}</dd>
                </div>
                <div>
                  <dt>SORTIE</dt>
                  <dd>{current.output}</dd>
                </div>
              </dl>
              <div className="atelier-file-links">
                {current.files.map((file) => (
                  <a href="#atelier-files" key={file}>
                    <Code2 size={13} />
                    <code>{file}</code>
                  </a>
                ))}
              </div>
            </div>
            <div className="atelier-code">
              <div>
                <span className="atelier-code-dots" aria-hidden="true">
                  ● ● ●
                </span>
                <span>Extrait du projet</span>
              </div>
              <h4>{current.exampleTitle}</h4>
              <pre>
                <code>{current.code}</code>
              </pre>
              <p>{current.explanation}</p>
            </div>
          </article>
          <div className="atelier-say">
            <BookOpen size={20} />
            <div>
              <span>POUR L’EXPLIQUER SIMPLEMENT</span>
              <p>{current.oral}</p>
            </div>
          </div>
        </section>

        <section id="atelier-calibration" className="atelier-section atelier-calibration">
          <div className="atelier-calibration-copy">
            <p className="atelier-eyebrow">02 / UNE RÉFÉRENCE, PAS UN GPS</p>
            <h2>
              Le centre,
              <br />
              c’est vous qui le fixez.
            </h2>
            <p>
              Faites varier l’angle, puis choisissez <b>Recentrer ici</b>. La position actuelle
              devient la nouvelle référence avec <code>MotionTracker.calibrate(time)</code>.
            </p>
            <div className="atelier-simulation-label">
              <Terminal size={16} />
              <span>
                Simulation pédagogique : des angles stables synthétiques alimentent le vrai module{' '}
                <code>src/motion.ts</code>. Aucun capteur n’est lu.
              </span>
            </div>
            <p className="atelier-calibration-note">
              Le point est lissé pour atténuer les petites variations. L’angle mesure une
              inclinaison ; il ne donne pas une position en centimètres.
            </p>
          </div>
          <div className="atelier-calibration-demo">
            <div className="atelier-demo-top">
              <span>VISÉE RELATIVE</span>
              <span>Référence : {anchor}°</span>
            </div>
            <div
              className="atelier-pointer-area"
              role="img"
              aria-label={`Pointeur simulé : x ${position.x.toFixed(2)}, y ${position.y.toFixed(2)}`}
            >
              <div className="atelier-crosshair-center" />
              <div
                className="atelier-demo-pointer"
                style={{ left: `${8 + position.x * 84}%`, top: `${8 + position.y * 84}%` }}
              >
                <Crosshair size={29} />
              </div>
              <span>GAUCHE</span>
              <span>DROITE</span>
            </div>
            <label htmlFor="atelier-angle">
              Inclinaison latérale γ <output>{angle}°</output>
            </label>
            <input
              id="atelier-angle"
              type="range"
              min="-32"
              max="32"
              value={angle}
              onChange={(event) => tilt(Number(event.target.value))}
            />
            <div className="atelier-demo-values">
              <code>x: {position.x.toFixed(2)}</code>
              <code>y: {position.y.toFixed(2)}</code>
            </div>
            <div className="atelier-demo-actions">
              <button type="button" onClick={calibrate}>
                <Crosshair size={16} /> Recentrer ici
              </button>
              <button type="button" onClick={reset} aria-label="Réinitialiser la simulation">
                <RotateCcw size={17} />
              </button>
            </div>
          </div>
        </section>

        <section id="atelier-oral" className="atelier-section">
          <div className="atelier-section-title">
            <div>
              <p className="atelier-eyebrow">03 / EXPLIQUER SANS SURPROMETTRE</p>
              <h2>Les questions qui comptent.</h2>
            </div>
            <p>
              Une réponse courte, puis les détails du code si votre interlocuteur veut aller plus
              loin.
            </p>
          </div>
          <div className="atelier-questions">
            {questions.map(([question, answer], index) => (
              <details key={question} open={index === 0 ? true : undefined}>
                <summary>
                  <span>0{index + 1}</span>
                  {question}
                  <ChevronDown size={20} />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="atelier-section atelier-stand">
          <div>
            <p className="atelier-eyebrow">04 / LE JOUR DU SALON</p>
            <h2>
              Préparer le passage
              <br />
              du prochain ninja.
            </h2>
            <p>
              Un visiteur joue avec son propre téléphone. L’installation se prépare sur le poste du
              stand ; aucun certificat ne doit être imposé sur son appareil.
            </p>
            <div className="atelier-stand-duration">
              <strong>2–3 min</strong>
              <span>
                créneau de départ proposé par visiteur,
                <br />à mesurer en répétition — pas un débit garanti.
              </span>
            </div>
            <p className="atelier-stand-detail">
              Avec Internet : tunnel HTTPS. Sans Internet : LAN HTTPS avec domaine réel, certificat
              public obtenu avant le salon et DNS local, à configurer et tester. En secours : pavé
              tactile en HTTP ou souris sur le PC.
            </p>
          </div>
          <div className="atelier-checklist">
            <h3>
              <ShieldCheck size={21} /> La répétition générale
            </h3>
            <p>
              Ces cases restent dans cette page et ne constituent pas une validation automatique.
            </p>
            {[
              'Scanner le QR avec un téléphone visiteur et vérifier la connexion.',
              'Effectuer trois essais : viser, recentrer, puis couper sans grand geste.',
              'Tester une partie complète, le mélange et une déconnexion.',
              'Vérifier le classement pour la même recette et le même mode.',
              'Prévoir la souris, une alimentation et une sauvegarde des résultats.',
            ].map((label, index) => (
              <label key={label}>
                <input
                  type="checkbox"
                  checked={checks.includes(index)}
                  onChange={() =>
                    setChecks((previous) =>
                      previous.includes(index)
                        ? previous.filter((item) => item !== index)
                        : [...previous, index],
                    )
                  }
                />
                <span className="atelier-check-box" aria-hidden="true">
                  {checks.includes(index) && <Check size={14} />}
                </span>
                <span>{label}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="atelier-section atelier-files" id="atelier-files">
          <div className="atelier-section-title">
            <div>
              <p className="atelier-eyebrow">05 / RETROUVER LE CODE</p>
              <h2>Les bons fichiers, au bon endroit.</h2>
            </div>
            <p>
              Chemins relatifs à la racine du projet, pour retrouver les sources dans l’éditeur. Les
              liens reviennent à l’explication du composant.
            </p>
          </div>
          <div className="atelier-file-grid">
            {blocks.map((block, index) => (
              <a href="#atelier-flow" onClick={() => setSelected(index)} key={block.id}>
                <strong>
                  {block.title}
                  <ArrowRight size={16} />
                </strong>
                {block.files.map((file) => (
                  <code key={file}>{file}</code>
                ))}
              </a>
            ))}
            <div>
              <strong>Stand et documentation</strong>
              <code>server/stand-api.ts</code>
              <code>server/stand-store.ts</code>
              <code>docs/architecture.md</code>
              <code>docs/salon.md</code>
            </div>
          </div>
          <div className="atelier-source-links">
            <span>POUR VÉRIFIER</span>
            <a
              href="https://developer.mozilla.org/en-US/docs/Web/API/Device_orientation_events/Detecting_device_orientation"
              target="_blank"
              rel="noreferrer"
            >
              MDN · Capteurs ↗
            </a>
            <a
              href="https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts"
              target="_blank"
              rel="noreferrer"
            >
              MDN · HTTPS ↗
            </a>
            <a
              href="https://letsencrypt.org/docs/challenge-types/#dns-01-challenge"
              target="_blank"
              rel="noreferrer"
            >
              Let’s Encrypt · DNS-01 ↗
            </a>
          </div>
        </section>
      </main>
      <footer className="atelier-footer">
        <span>CookingNinja · Support de démonstration</span>
        <strong>Lycée Guy Mollet · Arras · BTS SIO</strong>
        <a href="/">
          À vous de jouer <ArrowRight size={16} />
        </a>
      </footer>
    </div>
  );
}
