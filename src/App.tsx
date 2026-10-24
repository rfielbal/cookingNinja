import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChefHat,
  Clock3,
  Heart,
  Hourglass,
  Film,
  Bomb,
  Snowflake,
  Star,
  Zap,
  Leaf,
  Maximize,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Smartphone,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { KitchenScene } from './game/Scene';
import { CUT_SECONDS, GameEngine, type GameState } from './game/engine';
import { isSpecialKind } from './game/events';
import { FOODS, RECIPES, type Recipe } from './game/recipes';
import { audio } from './game/audio';
import { useHost, type MotionInput } from './net';
import { ArcadeMenu } from './components/ArcadeMenu';
import { Leaderboard } from './components/Leaderboard';
import { PracticeRange } from './components/PracticeRange';
import { ResultDiscovery } from './components/ResultDiscovery';
import { StandMode } from './components/StandMode';
import { BladePicker } from './components/BladePicker';
import { Celebration, ScoreCounter } from './components/Celebration';
import { BLADES, DEFAULT_BLADE, isBladeId, type BladeId } from '../shared/blades';
import type { ControllerActionMessage, ControllerSettingsMessage } from '../shared/protocol';
import { startRun, finishRun, newNickname, type ControlMode } from './stand';
import './arcade.css';
import './dojo.css';
import { PairDialog } from './components/PairDialog';
import { Modal } from './components/Modal';

type View = 'home' | 'recipes' | 'game';
type Dialog = 'pair' | 'diagnostic' | 'help' | 'settings' | 'board' | null;
const time = (s: number) =>
  `${Math.floor(Math.ceil(s) / 60)
    .toString()
    .padStart(2, '0')}:${(Math.ceil(s) % 60).toString().padStart(2, '0')}`;
function NinjaLogo() {
  return (
    <span className="brand-icon">
      <ChefHat size={29} strokeWidth={1.8} />
      <span className="ninja-eyes">⌁</span>
    </span>
  );
}

export default function App() {
  const [view, setView] = useState<View>('home');
  const [standActive, setStandActive] = useState(
    () => new URLSearchParams(window.location.search).get('stand') === '1',
  );
  const standRef = useRef(standActive);
  standRef.current = standActive;
  const [dialog, setDialog] = useState<Dialog>(null);
  const dialogRef = useRef(dialog);
  dialogRef.current = dialog;
  const [recipe, setRecipe] = useState(RECIPES[0]);
  const [state, setState] = useState<GameState | null>(null);
  const [mode, setMode] = useState<'mouse' | 'phone'>('phone');
  const [phoneReady, setPhoneReady] = useState(false);
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  const [blade, setBlade] = useState<BladeId>(() => {
    try {
      const saved = localStorage.getItem('cookingninja-blade');
      return isBladeId(saved) ? saved : DEFAULT_BLADE;
    } catch {
      return DEFAULT_BLADE;
    }
  });
  const bladeRef = useRef(blade);
  bladeRef.current = blade;
  const remoteAction = useRef<(message: ControllerActionMessage) => void>(() => {});
  const remoteSettings = useRef<(message: ControllerSettingsMessage) => void>(() => {});
  const lastPhoneInput = useRef(-Infinity);
  const readiness = useRef(false);
  const audioStatus = useSyncExternalStore(audio.subscribe, audio.getStatus, audio.getStatus);
  const muted = audioStatus === 'muted';
  const needsAudioActivation = !muted && audioStatus !== 'running';
  const [audioNotice, setAudioNotice] = useState('');
  const audioTestAttempt = useRef(0);
  const [boardRevision, setBoardRevision] = useState(0);
  const [lowQuality, setLowQuality] = useState(false);
  const [sceneError, setSceneError] = useState('');
  const [nickname, setNickname] = useState(newNickname);
  const [practice, setPractice] = useState(false);
  const practiceInput = useRef<((input: MotionInput) => void) | null>(null);
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [phoneSource, setPhoneSource] = useState<'motion' | 'touch'>('motion');
  const phoneSourceRef = useRef<'motion' | 'touch'>('motion');
  const sourceKnown = useRef(false);
  const run = useRef<{
    id: string;
    mode: ControlMode;
    eligible: boolean;
    finished: boolean;
  } | null>(null);
  const [notice, setNotice] = useState('');
  const [impact, setImpact] = useState<{
    serial: number;
    kind: 'bad' | 'danger' | 'blocked' | 'heal';
  } | null>(null);
  const impactSerial = useRef(0);
  const container = useRef<HTMLDivElement>(null);
  const scene = useRef<KitchenScene | null>(null);
  const engine = useRef<GameEngine | null>(null);
  const pointer = useRef({ x: 0.5, y: 0.5, at: 0 });
  const motion = useRef({ energy: 0, at: 0 });
  useEffect(() => {
    // Touch activation arrives on release; keyboard shortcuts may target the body.
    const activate = (event: Event) => {
      if (standRef.current) return;
      // Explicit audio controls own their gesture. Auto-unlocking before their
      // click could change "activate" into "mute" while the pointer is held.
      if (event.target instanceof Element && event.target.closest('[data-audio-control]')) return;
      void audio.unlock();
    };
    const pointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') activate(event);
    };
    const pointerUp = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') activate(event);
    };
    window.addEventListener('click', activate, true);
    window.addEventListener('pointerdown', pointerDown, true);
    window.addEventListener('pointerup', pointerUp, true);
    window.addEventListener('keydown', activate, true);
    return () => {
      audioTestAttempt.current++;
      window.removeEventListener('click', activate, true);
      window.removeEventListener('pointerdown', pointerDown, true);
      window.removeEventListener('pointerup', pointerUp, true);
      window.removeEventListener('keydown', activate, true);
    };
  }, []);
  const testAudio = () => {
    const attempt = ++audioTestAttempt.current;
    audio.muted = false;
    setAudioNotice('');
    // test() calls resume synchronously, while this click still grants activation.
    void audio.test().then((scheduled) => {
      if (attempt !== audioTestAttempt.current || audio.muted || document.hidden) return;
      setAudioNotice(
        scheduled
          ? 'Deux notes envoyées au PC. Si vous ne les entendez pas, vérifiez le volume et la sortie audio du navigateur.'
          : 'Le test n’a pas été joué. Réessayez sur le PC ou ouvrez le jeu dans un navigateur externe.',
      );
    });
  };
  const toggleAudio = () => {
    if (muted || needsAudioActivation) testAudio();
    else {
      audioTestAttempt.current++;
      audio.muted = true;
      setAudioNotice('');
    }
  };
  useEffect(() => {
    if (!impact) return;
    const timeout = window.setTimeout(() => setImpact(null), 850);
    return () => window.clearTimeout(timeout);
  }, [impact]);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const stateRef = useRef(state);
  stateRef.current = state;
  const input = useCallback((data: MotionInput) => {
    if (standRef.current) return;
    lastPhoneInput.current = performance.now();
    sourceKnown.current = data.source === 'motion' || data.source === 'touch';
    if (run.current && modeRef.current === 'phone' && !sourceKnown.current)
      run.current.eligible = false;
    const source = data.source || 'motion';
    if (source !== phoneSourceRef.current) {
      phoneSourceRef.current = source;
      setPhoneSource(source);
      if (run.current && modeRef.current === 'phone' && run.current.mode !== source)
        run.current.eligible = false;
    }
    practiceInput.current?.(data);
    if (modeRef.current !== 'phone') return;
    const now = performance.now();
    scene.current?.setPointer(data.x, data.y, data.slash);
    if (data.slash && engine.current?.state.phase === 'playing') {
      if (data.source === 'touch' && data.fromX !== undefined && data.fromY !== undefined)
        scene.current?.slash({ x: data.fromX, y: data.fromY }, data);
      else if (now - pointer.current.at < 250) scene.current?.slash(pointer.current, data);
    }
    pointer.current = { x: data.x, y: data.y, at: now };
    motion.current = { energy: data.stir, at: now };
  }, []);
  const host = useHost(
    input,
    (message) => remoteAction.current(message),
    (message) => remoteSettings.current(message),
  );
  const selectBlade = (next: BladeId) => {
    bladeRef.current = next;
    setBlade(next);
    scene.current?.setBlade(next);
    try {
      localStorage.setItem('cookingninja-blade', next);
    } catch {
      // The choice still applies when storage is unavailable.
    }
  };
  const navigate = (next: View) => {
    audio.setPhase('menu');
    run.current = null;
    setPractice(false);
    setImpact(null);
    engine.current = null;
    setState(null);
    setView(next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const choose = (item: Recipe) => {
    setSaveStatus('');
    setRecipe(item);
    setView('game');
    setState(null);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const openStand = () => {
    if (view !== 'home' || engine.current) return;
    standRef.current = true;
    setStandActive(true);
    setDialog(null);
    setPractice(false);
    audioTestAttempt.current++;
    audio.setPhase('paused');
    audio.setMix(0);
    scene.current?.setPaused(true);
    pointer.current.at = 0;
    motion.current = { energy: 0, at: 0 };
    lastPhoneInput.current = -Infinity;
    readiness.current = false;
    setPhoneReady(false);
  };
  const closeStand = useCallback(() => {
    standRef.current = false;
    setStandActive(false);
    pointer.current.at = 0;
    motion.current = { energy: 0, at: 0 };
    lastPhoneInput.current = -Infinity;
    readiness.current = false;
    setPhoneReady(false);
    audio.setPhase('menu');
    const url = new URL(window.location.href);
    if (url.searchParams.get('stand') === '1') {
      url.searchParams.delete('stand');
      history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);
  const createGame = useCallback(() => {
    run.current = null;
    setSaveStatus('');
    setPractice(false);
    setImpact(null);
    const game = new GameEngine(recipe, (id, kind, target, shiny) => {
      scene.current?.spawn(id, kind, target, shiny);
      if (shiny) audio.play('rare-reveal');
    });
    engine.current = game;
    setState(game.snapshot());
    pointer.current.at = 0;
    motion.current = { energy: 0, at: 0 };
    audio.setRecipe(recipe.id);
    audio.setPhase('ready');
    scene.current?.setRecipe(recipe.id);
    scene.current?.setMode('hero');
    scene.current?.setPaused(false);
  }, [recipe]);
  useEffect(() => {
    if (!container.current) return;
    setSceneError('');
    try {
      const instance = new KitchenScene(container.current, {
        quality: lowQuality ? 'low' : 'high',
        onSlash: (strength) => audio.slash(strength),
        onHit: (id, kind) => {
          const result = engine.current?.hit(id);
          if (!result) return null;
          audio.play(result, {
            food: isSpecialKind(kind) ? undefined : kind,
            combo: engine.current?.state.combo,
            pan: (pointer.current.x - 0.5) * 1.4,
          });
          if (
            result === 'bad' ||
            result === 'danger' ||
            result === 'blocked' ||
            result === 'heal'
          ) {
            setImpact({ serial: ++impactSerial.current, kind: result });
          }
          if (engine.current) setState(engine.current.snapshot());
          return result;
        },
      });
      scene.current = instance;
      instance.setRecipe(recipe.id);
      audio.setRecipe(recipe.id);
      instance.setBlade(bladeRef.current);
      instance.setPaused(standRef.current);
      if (view === 'game') createGame();
      return () => {
        instance.dispose();
        scene.current = null;
      };
    } catch {
      setSceneError(
        'La 3D ne peut pas démarrer. Activez l’accélération graphique et utilisez un navigateur compatible WebGL 2.',
      );
    }
  }, [view, recipe.id, lowQuality, createGame]);
  useEffect(() => {
    // The exercise owns its own scene; keep the covered arena idle until it closes.
    scene.current?.setPaused(standActive || practice || engine.current?.state.phase === 'paused');
    if (standActive) audio.setPhase('paused');
  }, [standActive, practice, state?.phase]);
  useEffect(() => {
    let frame = 0,
      last = performance.now(),
      lastPaint = 0;
    let previousGame: GameEngine | null = null;
    let previousPhase: GameState['phase'] = 'ready';
    let previousEvent: GameState['event'] = 'normal';
    let previousCountdown = 0;
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const game = engine.current;
      const receivingInput = now - lastPhoneInput.current < 1500;
      if (receivingInput !== readiness.current) {
        readiness.current = receivingInput;
        setPhoneReady(receivingInput);
      }
      if (standRef.current) {
        audio.setPhase('paused');
        frame = requestAnimationFrame(loop);
        return;
      }
      if (game) {
        if (game !== previousGame) {
          previousGame = game;
          previousPhase = 'ready';
          previousEvent = 'normal';
          previousCountdown = 0;
        }
        const before = previousPhase;
        if (
          modeRef.current === 'phone' &&
          !receivingInput &&
          ['countdown', 'playing', 'mixing'].includes(game.state.phase)
        ) {
          game.pause();
          scene.current?.setPaused(true);
        }
        const energy = now - motion.current.at < 160 ? motion.current.energy : 0;
        const phaseBeforeTick = game.state.phase;
        const focusedBeforeTick = !!game.state.focus;
        game.tick(dt, energy);
        audio.setPhase(game.state.phase);
        audio.setEvent(game.state.event);
        audio.setMix(game.state.phase === 'mixing' ? energy : 0);
        if (game.state.phase === 'countdown') {
          const step = Math.ceil(game.state.countdown);
          if (step !== previousCountdown) audio.play('countdown', { step });
          previousCountdown = step;
        } else previousCountdown = 0;
        if (focusedBeforeTick && !game.state.focus && game.state.phase === 'playing')
          audio.play('focus-end', { combo: game.state.combo });
        if (game.state.phase === 'mixing') scene.current?.stir(energy);
        if (before !== game.state.phase) {
          if (game.state.phase === 'playing' && phaseBeforeTick === 'countdown') {
            scene.current?.setMode('playing');
            audio.play('start');
          }
          if (game.state.phase === 'mixing') {
            scene.current?.setMode('mixing');
            if (before !== 'paused') audio.play('mix-start');
          }
          if (game.state.phase === 'result') {
            scene.current?.setOutcome(game.state.outcome === 'won');
            scene.current?.setMode('result');
            audio.play(game.state.outcome === 'won' ? 'win' : 'lose');
          }
        }
        scene.current?.setEvent(game.state.event, game.state.worldSpeed);
        scene.current?.setFocus(game.state.focus);
        scene.current?.setShield(game.state.shieldRemaining);
        if (game.state.event === 'rush' && previousEvent !== 'rush') audio.play('rush');
        previousEvent = game.state.event;
        if (
          before !== game.state.phase ||
          (now - lastPaint > 100 && ['countdown', 'playing', 'mixing'].includes(game.state.phase))
        ) {
          setState(game.snapshot());
          lastPaint = now;
        }
        previousPhase = game.state.phase;
      } else audio.setPhase('menu');
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      audio.stop();
    };
  }, []);
  const pause = useCallback(() => {
    if (!engine.current || !['countdown', 'playing', 'mixing'].includes(engine.current.state.phase))
      return;
    engine.current.pause();
    audio.setPhase('paused');
    scene.current?.setPaused(true);
    setState(engine.current.snapshot());
  }, []);
  const resume = () => {
    if (
      standRef.current ||
      engine.current?.state.phase !== 'paused' ||
      document.hidden ||
      (modeRef.current === 'phone' &&
        (!host.connected || performance.now() - lastPhoneInput.current >= 1500))
    )
      return;
    pointer.current.at = 0;
    motion.current = { energy: 0, at: 0 };
    engine.current?.resume();
    scene.current?.setPaused(false);
    if (engine.current) setState(engine.current.snapshot());
  };
  useEffect(() => {
    const visibility = () => {
      setPageVisible(!document.hidden);
      if (document.hidden) pause();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !dialog) pause();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('keydown', key);
    };
  }, [pause, dialog]);
  useEffect(() => {
    if (!host.connected) {
      lastPhoneInput.current = -Infinity;
      setPhoneReady(false);
      if (mode === 'phone') pause();
    }
  }, [host.connected, mode, pause]);
  useEffect(() => {
    // Pairing can finish automatically; a diagnostic opened deliberately stays readable.
    if (dialog === 'pair' && host.connected && phoneReady) setDialog(null);
  }, [dialog, host.connected, phoneReady]);
  const validNickname = /^[\p{L}\p{N} ._'’-]{2,20}$/u.test(nickname.trim().normalize('NFKC'));
  const remoteReady =
    mode === 'phone' &&
    host.connected &&
    phoneReady &&
    pageVisible &&
    !dialog &&
    !sceneError &&
    !standActive;
  useEffect(() => {
    const s = stateRef.current;
    host.sendState({
      phase: view !== 'game' ? 'menu' : s?.phase || 'ready',
      recipe: recipe.name,
      hearts: s?.hearts ?? 3,
      score: s?.score ?? 0,
      canStart:
        view === 'game' && s?.phase === 'ready' && remoteReady && validNickname && !starting,
      canResume: view === 'game' && s?.phase === 'paused' && remoteReady,
      starting,
      blade,
      controlMode: mode === 'mouse' ? 'mouse' : phoneSource,
      notice: standActive
        ? 'Présentation sur le PC'
        : !pageVisible
          ? 'Remettez le jeu au premier plan sur le PC.'
          : dialog
            ? 'Fermez la fenêtre ouverte sur le PC pour jouer.'
            : mode === 'mouse'
              ? 'Choisissez Téléphone dans la préparation sur le PC.'
              : view !== 'game'
                ? 'Choisissez une recette et votre pseudo sur le PC.'
                : sceneError
                  ? 'La scène 3D est indisponible sur le PC.'
                  : !validNickname
                    ? 'Vérifiez votre pseudo sur le PC.'
                    : !phoneReady
                      ? 'Préparez votre commande pour jouer.'
                      : practice
                        ? 'Entraînement sur le PC. Lancez quand vous êtes prêt.'
                        : s?.phase === 'result'
                          ? 'Rejouez ou choisissez une nouvelle recette sur le PC.'
                          : '',
    });
  }, [
    view,
    state?.phase,
    state?.hearts,
    state?.score,
    host.connected,
    host.code,
    recipe.name,
    remoteReady,
    validNickname,
    starting,
    blade,
    mode,
    phoneSource,
    pageVisible,
    dialog,
    sceneError,
    phoneReady,
    practice,
    standActive,
  ]);
  const begin = async () => {
    const game = engine.current;
    if (
      standRef.current ||
      !game ||
      game.state.phase !== 'ready' ||
      startingRef.current ||
      document.hidden ||
      !!dialog ||
      !!sceneError ||
      !validNickname ||
      (mode === 'phone' && (!host.connected || performance.now() - lastPhoneInput.current >= 1500))
    )
      return;
    startingRef.current = true;
    setStarting(true);
    setSaveStatus('');
    const control = mode === 'mouse' ? 'mouse' : phoneSourceRef.current;
    try {
      const result = await startRun(nickname.trim(), recipe.id, control);
      if (engine.current !== game) return;
      run.current = {
        id: result.id,
        mode: control,
        eligible:
          control === (modeRef.current === 'mouse' ? 'mouse' : phoneSourceRef.current) &&
          (modeRef.current === 'mouse' || sourceKnown.current),
        finished: false,
      };
    } catch {
      if (engine.current !== game) return;
      setSaveStatus('Partie libre : le classement est indisponible pour cette partie.');
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
    if (engine.current !== game) return;
    if (
      standRef.current ||
      document.hidden ||
      dialogRef.current !== null ||
      modeRef.current !== mode ||
      (modeRef.current === 'phone' &&
        (performance.now() - lastPhoneInput.current >= 1500 || phoneSourceRef.current !== control))
    ) {
      run.current = null;
      return;
    }
    scene.current?.setPaused(false);
    setPractice(false);
    engine.current?.start();
    if (engine.current) setState(engine.current.snapshot());
  };
  remoteAction.current = (message) => {
    if (standRef.current || modeRef.current !== 'phone' || !host.connected) return;
    if (message.action === 'pause') pause();
    if (message.action === 'start') void begin();
    if (message.action === 'resume' && !dialog && !sceneError) resume();
  };
  remoteSettings.current = (message) => {
    selectBlade(message.blade);
    if (message.mode === phoneSourceRef.current) return;
    // Clear the previous gesture before accepting input in the new coordinate system.
    lastPhoneInput.current = -Infinity;
    pointer.current.at = 0;
    motion.current = { energy: 0, at: 0 };
    sourceKnown.current = false;
    setPhoneReady(false);
    phoneSourceRef.current = message.mode;
    setPhoneSource(message.mode);
    if (modeRef.current === 'phone') {
      pause();
      if (run.current && !run.current.finished && run.current.mode !== message.mode) {
        run.current.eligible = false;
        setSaveStatus('Partie libre : commande changée pendant la partie.');
      }
    }
  };
  const saveResult = useCallback(async () => {
    const current = run.current;
    const result = engine.current?.snapshot();
    if (!current || !result || result.phase !== 'result' || current.finished) return;
    if (!current.eligible) {
      current.finished = true;
      setSaveStatus('Partie libre : commande changée ou non identifiée pendant la partie.');
      return;
    }
    current.finished = true;
    setSaveStatus('Enregistrement du résultat…');
    try {
      await finishRun(current.id, result);
      if (run.current === current) {
        setBoardRevision((revision) => revision + 1);
        setSaveStatus(
          result.outcome === 'won'
            ? 'Recette réussie ! Votre score est au classement.'
            : 'Résultat enregistré. Réussissez la recette pour entrer au classement.',
        );
      }
    } catch {
      current.finished = false;
      if (run.current === current)
        setSaveStatus('Enregistrement interrompu. Vous pouvez réessayer.');
    }
  }, []);
  useEffect(() => {
    if (state?.phase === 'result') void saveResult();
  }, [state?.phase, saveResult]);
  const changeMode = (next: 'mouse' | 'phone') => {
    if (run.current && next !== modeRef.current) run.current.eligible = false;
    modeRef.current = next;
    pointer.current.at = 0;
    motion.current = { energy: 0, at: 0 };
    setMode(next);
  };
  const nextVisitor = () => {
    host.reset();
    lastPhoneInput.current = -Infinity;
    setPhoneReady(false);
    setNickname(newNickname());
    setMode('phone');
    setPhoneSource('motion');
    phoneSourceRef.current = 'motion';
    sourceKnown.current = false;
    navigate('recipes');
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (standRef.current || mode !== 'mouse' || !container.current) return;
    const bounds = container.current.getBoundingClientRect();
    const next = {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
      at: performance.now(),
    };
    const active = (event.buttons & 1) === 1;
    scene.current?.setPointer(next.x, next.y, active);
    if (active && next.at - pointer.current.at < 200) {
      if (engine.current?.state.phase === 'playing') scene.current?.slash(pointer.current, next);
      const distance = Math.hypot(next.x - pointer.current.x, next.y - pointer.current.y);
      motion.current = {
        energy: Math.min(
          1,
          (distance / Math.max(0.001, (next.at - pointer.current.at) / 1000)) * 1.2,
        ),
        at: next.at,
      };
    }
    pointer.current = next;
  };
  const completed =
    state &&
    recipe.ingredients.reduce((sum, key) => sum + Math.min(state.counts[key] || 0, recipe.goal), 0);
  const total = recipe.ingredients.length * recipe.goal;
  const bladeStyle = BLADES.find((item) => item.id === blade)!;

  return (
    <div
      className={`app view-${view} ${lowQuality ? 'quality-low' : ''}`}
      onClickCapture={(event) => {
        if (
          !standRef.current &&
          (view !== 'game' || dialogRef.current) &&
          event.target instanceof Element &&
          event.target.closest('button')
        )
          audio.play('select');
      }}
      style={
        { '--blade-color': bladeStyle.color, '--blade-glow': bladeStyle.glow } as CSSProperties
      }
    >
      <header className="site-header">
        <button
          className="brand"
          aria-label="CookingNinja — Accueil"
          onClick={() => navigate('home')}
        >
          <NinjaLogo />
          <span>
            cooking<span className="brand-accent">ninja</span>
          </span>
        </button>
        <div className="school-sign">
          <strong>
            <span>Lycée</span> Guy Mollet
          </strong>
          <span className="school-location">
            Arras <i aria-hidden="true" /> BTS SIO
          </span>
        </div>
        <div className="header-actions">
          {view === 'home' && (
            <button className="stand-mode-trigger" onClick={openStand}>
              <Film size={17} /> Mode stand
            </button>
          )}
          <button
            className={`connect-button ${host.connected ? 'is-connected' : ''}`}
            onClick={() => {
              pause();
              setDialog(host.connected ? 'diagnostic' : 'pair');
            }}
          >
            <Smartphone size={17} />
            <span>{host.connected ? 'Téléphone connecté' : 'Connecter mon téléphone'}</span>
            <i />
          </button>
          <button
            className="icon-button settings-button"
            aria-label="Réglages"
            onClick={() => {
              pause();
              setDialog('settings');
            }}
          >
            <Settings2 size={20} />
          </button>
        </div>
      </header>

      {view !== 'game' && (
        <ArcadeMenu
          key={view}
          screen={view}
          recipe={recipe}
          onRecipe={setRecipe}
          onPlay={() => {
            if (view === 'home') navigate('recipes');
            else choose(recipe);
          }}
          onBoard={() => setDialog('board')}
          onHelp={() => setDialog('help')}
          onBack={() => navigate('home')}
          nickname={nickname}
          onNickname={setNickname}
          sceneRef={container}
          sceneError={sceneError}
          keyboardEnabled={!dialog && !standActive}
        />
      )}

      {view === 'home' && (
        <div className="home-leaderboards">
          <Leaderboard
            variant="home"
            refreshKey={boardRevision}
            onPlay={(recipeId) => {
              if (recipeId) setRecipe(RECIPES.find((item) => item.id === recipeId)!);
              navigate('recipes');
            }}
          />
        </div>
      )}

      {view === 'game' && (
        <main className="game-page">
          <div className="game-toolbar">
            <button className="text-button" onClick={() => navigate('recipes')}>
              <ArrowLeft size={17} /> Les recettes
            </button>
            <span>
              {recipe.category} <b> / </b> {recipe.name}
            </span>
            <div>
              <button
                className="icon-button"
                data-audio-control
                aria-label={
                  muted || needsAudioActivation ? 'Activer le son sur le PC' : 'Couper les sons'
                }
                title={
                  needsAudioActivation ? 'Le navigateur attend une activation du son' : undefined
                }
                onClick={toggleAudio}
              >
                {muted || needsAudioActivation ? <VolumeX size={19} /> : <Volume2 size={19} />}
              </button>
              <button
                className="icon-button"
                aria-label="Mettre en pause"
                disabled={!state || !['playing', 'mixing', 'countdown'].includes(state.phase)}
                onClick={pause}
              >
                <Pause size={19} />
              </button>
              <button
                className="icon-button"
                aria-label="Plein écran"
                onClick={() => {
                  const promise = document.fullscreenElement
                    ? document.exitFullscreen?.()
                    : document.documentElement.requestFullscreen?.();
                  promise?.catch(() =>
                    setNotice('Le plein écran n’est pas disponible dans ce navigateur.'),
                  );
                }}
              >
                <Maximize size={18} />
              </button>
            </div>
          </div>
          {needsAudioActivation && (
            <div className="audio-activation" role="status" data-audio-control>
              <VolumeX size={17} />
              <span>Le son attend un clic sur le PC.</span>
              <button className="text-button" onClick={testAudio}>
                Activer et tester
              </button>
            </div>
          )}
          {saveStatus.startsWith('Partie libre') && state?.phase !== 'result' && (
            <p className="ranking-note" role="status">
              {saveStatus}
            </p>
          )}
          <div
            className={`game-arena recipe-${recipe.id} phase-${state?.phase || 'ready'} event-${state?.event || 'normal'} ${state?.outcome === 'won' ? 'is-victory' : ''}`}
            onPointerMove={onPointerMove}
            onPointerDown={(e) => {
              if (
                mode === 'mouse' &&
                ['playing', 'mixing'].includes(engine.current?.state.phase || '')
              ) {
                e.currentTarget.setPointerCapture(e.pointerId);
                pointer.current.at = 0;
              }
            }}
            onPointerUp={() => {
              motion.current.energy = 0;
            }}
            onPointerLeave={() => {
              pointer.current.at = 0;
            }}
          >
            <div className="arena-atmosphere" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <div className="arena-scene" ref={container} />
            {impact && (
              <div
                key={impact.serial}
                className={`mistake-impact impact-${impact.kind}`}
                aria-hidden="true"
              >
                <span>
                  {impact.kind === 'heal' ? (
                    <>
                      +1 <Heart fill="currentColor" />
                    </>
                  ) : impact.kind === 'blocked' ? (
                    <>
                      <ShieldCheck /> Protégé
                    </>
                  ) : (
                    <>
                      <X /> {impact.kind === 'danger' ? '−2' : '−1'} <Heart fill="currentColor" />
                    </>
                  )}
                </span>
              </div>
            )}
            {sceneError && (
              <div className="scene-error" role="alert">
                {sceneError}
              </div>
            )}
            {state && ['playing', 'mixing', 'paused', 'countdown'].includes(state.phase) && (
              <>
                <div className="game-hud">
                  <div
                    className={`hearts ${impact?.kind === 'heal' ? 'hearts-restored' : ''}`}
                    aria-label={`${state.hearts} cœurs restants`}
                  >
                    {[1, 2, 3].map((i) => (
                      <Heart
                        key={i}
                        size={26}
                        fill={i <= state.hearts ? 'currentColor' : 'transparent'}
                        className={i > state.hearts ? 'empty' : ''}
                      />
                    ))}
                  </div>
                  <div className="hud-time">
                    <Clock3 size={19} />
                    <strong>{time(state.remaining)}</strong>
                    <span>{state.phase === 'mixing' ? 'ON MÉLANGE !' : 'À VOUS DE TRANCHER'}</span>
                  </div>
                  <div className="hud-score">
                    <span>VOTRE SCORE</span>
                    <strong key={state.score}>{state.score.toLocaleString('fr')}</strong>
                  </div>
                </div>
                {state.phase === 'playing' && (
                  <>
                    <div className="recipe-progress">
                      <span>
                        {completed} / {total} ingrédients
                      </span>
                      <div>
                        <i style={{ width: `${((completed || 0) / total) * 100}%` }} />
                      </div>
                    </div>
                    <div
                      className={`game-feedback ${state.feedback.startsWith('Oups') || state.feedback.startsWith('BOMBE ·') ? 'bad-feedback' : ''}`}
                      key={state.feedbackSerial}
                    >
                      {state.feedback}
                    </div>
                    <div className="arena-legend" aria-label="Objets spéciaux">
                      <span className="legend-heart">
                        <Heart size={15} fill="currentColor" /> +1 vie
                      </span>
                      <span className="legend-shield">
                        <Star size={15} /> Bouclier 10 s
                      </span>
                      <span className="legend-slow">
                        <Hourglass size={15} /> Ralenti
                      </span>
                      <span className="legend-danger">
                        <Bomb size={15} /> −2 <Heart size={12} />
                      </span>
                    </div>
                    {state.shieldRemaining > 0 && (
                      <div
                        className="shield-status"
                        aria-label={`Bouclier : ${Math.ceil(state.shieldRemaining)} secondes`}
                      >
                        <ShieldCheck size={21} />
                        <strong>{Math.ceil(state.shieldRemaining)} s</strong>
                        <span style={{ transform: `scaleX(${state.shieldRemaining / 10})` }} />
                      </div>
                    )}
                    {state.event === 'rush' && (
                      <div className="frenzy-fx" aria-hidden="true">
                        {Array.from({ length: 8 }, (_, i) => (
                          <i key={i} style={{ '--streak': i } as CSSProperties} />
                        ))}
                        <strong>FRÉNÉSIE</strong>
                      </div>
                    )}
                    {(state.event === 'rush' || state.event === 'slow') && (
                      <div
                        className={`event-banner banner-${state.event}`}
                        key={state.event}
                        role="status"
                      >
                        {state.event === 'slow' ? <Snowflake /> : <Zap fill="currentColor" />}
                        <span>
                          <strong>{state.event === 'slow' ? 'RALENTI' : 'FRÉNÉSIE'}</strong>
                          <small>
                            {Math.ceil(state.eventRemaining)} s
                            {state.event === 'rush' ? ' · Ça accélère !' : ''}
                          </small>
                        </span>
                      </div>
                    )}
                    {state.focus && (
                      <div className="focus-hud" aria-label="Défi de découpe">
                        <span className="focus-countdown">
                          {Math.ceil(state.focus.remaining)}
                          <small>s</small>
                        </span>
                        <div>
                          <strong>TRANCHEZ !</strong>
                          <span>
                            <b key={state.focus.cuts}>{state.focus.cuts}</b> coupes{' '}
                            <em>+{state.focus.points} pts</em>
                          </span>
                        </div>
                        <div className="focus-meter">
                          <i style={{ transform: `scaleX(${state.focus.remaining / 3})` }} />
                        </div>
                      </div>
                    )}
                    <div className="game-timeline">
                      <i style={{ width: `${(state.remaining / CUT_SECONDS) * 100}%` }} />
                    </div>
                  </>
                )}
              </>
            )}
            {state?.phase === 'ready' && !practice && (
              <div className="ready-overlay">
                <span className="pill">RECETTE N° {RECIPES.indexOf(recipe) + 1}</span>
                <h2>{recipe.name}</h2>
                <span className="player-label">À vous de jouer, {nickname}</span>
                <div className="ready-info">
                  <span>
                    <Clock3 size={17} /> 80 s + 8 s de mélange
                  </span>
                  <span>
                    <Heart size={17} /> 3 cœurs
                  </span>
                </div>
                <div className="input-switch">
                  <button
                    className={mode === 'mouse' ? 'selected' : ''}
                    onClick={() => changeMode('mouse')}
                  >
                    <MousePointer2 size={16} /> Souris
                  </button>
                  <button
                    className={mode === 'phone' ? 'selected' : ''}
                    onClick={() => changeMode('phone')}
                  >
                    <Smartphone size={16} /> Téléphone
                  </button>
                </div>
                {mode === 'phone' && !host.connected ? (
                  <button className="button primary" onClick={() => setDialog('pair')}>
                    Connecter mon téléphone <Smartphone size={19} />
                  </button>
                ) : (
                  <button
                    className="button primary"
                    disabled={starting || !!sceneError || (mode === 'phone' && !phoneReady)}
                    onClick={() => (mode === 'phone' ? setPractice(true) : void begin())}
                  >
                    {starting
                      ? 'Préparation…'
                      : mode === 'phone' && !phoneReady
                        ? 'Activez et calibrez le téléphone'
                        : mode === 'phone'
                          ? 'Tester mes gestes'
                          : 'C’est parti, chef !'}{' '}
                    <ArrowRight size={19} />
                  </button>
                )}
                {mode === 'phone' && host.connected && (
                  <div
                    className={`remote-launch-hint ${phoneReady ? 'is-ready' : ''}`}
                    role="status"
                  >
                    <Smartphone size={18} />
                    <span>
                      <strong>
                        {phoneReady
                          ? 'Lancez la partie depuis votre téléphone'
                          : 'Préparez votre téléphone'}
                      </strong>
                      {phoneSource === 'touch' ? 'Pavé tactile' : 'Gyroscope'} ·{' '}
                      {phoneReady ? 'Commandes reçues' : 'En attente de commandes'}
                    </span>
                  </div>
                )}
                {mode === 'phone' && host.connected && (
                  <button className="text-button" onClick={() => setDialog('diagnostic')}>
                    Diagnostic de connexion
                  </button>
                )}
                <BladePicker value={blade} onChange={selectBlade} compact />
                <div className="ready-rules" aria-label="Règles essentielles">
                  <span>
                    <Check /> {recipe.goal} de chaque ingrédient
                  </span>
                  <span>
                    <X /> Piège : −1 <Heart />
                  </span>
                </div>
                <div className="special-guide" aria-label="Objets spéciaux">
                  <span className="legend-heart">
                    <Heart fill="currentColor" /> +1 vie · 3 occasions
                  </span>
                  <span className="legend-shield">
                    <Star /> Bouclier 10 s
                  </span>
                  <span className="legend-slow">
                    <Hourglass /> Ralenti
                  </span>
                  <span className="legend-danger">
                    <Bomb /> −2 <Heart />
                  </span>
                  <span>
                    <Sparkles /> Brillant : tranchez vite !
                  </span>
                </div>
              </div>
            )}
            {state?.phase === 'ready' && practice && (
              <PracticeRange
                recipe={recipe}
                lowQuality={lowQuality}
                inputRef={practiceInput}
                ready={phoneReady && host.connected && pageVisible && !dialog}
                source={phoneSource}
                busy={starting}
                onBegin={() => void begin()}
                onClose={() => setPractice(false)}
              />
            )}
            {state?.phase === 'countdown' && (
              <div className="countdown-overlay">
                <span>À VOS GESTES…</span>
                <strong key={Math.ceil(state.countdown)}>{Math.ceil(state.countdown)}</strong>
                <p>Repérez votre liste d’ingrédients !</p>
              </div>
            )}
            {state?.phase === 'paused' && (
              <div className="pause-overlay">
                <Pause size={35} />
                <h2>Petite pause en cuisine.</h2>
                <p>
                  {mode === 'phone' && (!host.connected || !phoneReady)
                    ? 'Les commandes du téléphone sont interrompues. Gardez son écran actif, terminez la calibration ou passez à la souris.'
                    : 'Vos ingrédients vous attendent.'}
                </p>
                <button
                  className="button primary"
                  disabled={mode === 'phone' && (!host.connected || !phoneReady)}
                  onClick={resume}
                >
                  Reprendre <Play size={18} />
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    changeMode('mouse');
                    resume();
                  }}
                >
                  Continuer à la souris
                </button>
                <button className="text-button" onClick={nextVisitor}>
                  Terminer et changer de joueur
                </button>
                {mode === 'phone' && !host.connected && (
                  <button className="text-button" onClick={() => setDialog('pair')}>
                    Reconnecter le téléphone
                  </button>
                )}
                {mode === 'phone' && host.connected && (
                  <button className="text-button" onClick={() => setDialog('diagnostic')}>
                    Diagnostic de connexion
                  </button>
                )}
              </div>
            )}
            {state?.phase === 'mixing' && (
              <div className="mix-overlay">
                <h2>Tournez !</h2>
                <p>
                  {mode === 'phone'
                    ? phoneSource === 'touch'
                      ? 'Des cercles sur le pavé.'
                      : 'De petits cercles avec le téléphone.'
                    : 'Clic maintenu, faites des cercles.'}
                </p>
                <div className="mix-meter">
                  <i style={{ width: `${state.mix * 100}%` }} />
                  <span>{Math.round(state.mix * 100)} %</span>
                </div>
                <small>Objectif : 35 %</small>
              </div>
            )}
            {state?.phase === 'result' && (
              <div
                className={`result-overlay ${state.outcome === 'won' ? 'result-won' : 'result-retry'}`}
              >
                <Celebration won={state.outcome === 'won'} lowQuality={lowQuality} />
                <span className="result-icon">
                  {state.outcome === 'won' ? <Trophy size={40} /> : <ChefHat size={40} />}
                </span>
                <p className="eyebrow">
                  {state.outcome === 'won'
                    ? 'LE CHEF, C’EST VOUS.'
                    : 'MÊME LES NINJAS S’ENTRAÎNENT.'}
                </p>
                <h2>
                  {state.outcome === 'won' ? 'C’est prêt. À table !' : 'On remet le couvert ?'}
                </h2>
                <p>
                  {state.outcome === 'won'
                    ? `${recipe.name} : une recette rondement menée.`
                    : state.outcome === 'hearts'
                      ? 'Vous n’avez plus de cœurs.'
                      : state.outcome === 'ingredients'
                        ? 'Il manque des ingrédients. Gardez un œil sur votre liste.'
                        : 'Le mélange manque d’énergie. Bougez régulièrement pendant les 8 secondes.'}
                </p>
                <div className="result-stats">
                  <div>
                    <strong>
                      <ScoreCounter value={state.score} />
                    </strong>
                    <span>POINTS</span>
                  </div>
                  <div>
                    <strong>×{state.bestCombo}</strong>
                    <span>MEILLEUR COMBO</span>
                  </div>
                  <div>
                    <strong>{state.hits}</strong>
                    <span>BONNES COUPES</span>
                  </div>
                </div>
                <p className="save-status" role="status">
                  {saveStatus}
                </p>
                {saveStatus.includes('réessayer') && (
                  <button className="text-button" onClick={() => void saveResult()}>
                    Réessayer l’enregistrement
                  </button>
                )}
                <div className="result-actions">
                  <button className="button secondary" onClick={createGame}>
                    <RotateCcw size={17} /> Rejouer
                  </button>
                  <button className="button primary" onClick={nextVisitor}>
                    Joueur suivant <ArrowRight size={17} />
                  </button>
                  <button className="text-button" onClick={() => setDialog('board')}>
                    <Trophy size={17} /> Classement
                  </button>
                </div>
                <ResultDiscovery />
              </div>
            )}
          </div>
          <div className="ingredient-tray">
            <div className="tray-label">
              <ChefHat size={23} />
              <div>
                <strong>Votre mise en place</strong>
                <span>LES BONS INGRÉDIENTS</span>
              </div>
            </div>
            <div className="ingredient-list">
              {recipe.ingredients.map((kind) => (
                <div
                  key={kind}
                  className={`ingredient ${(state?.counts[kind] || 0) >= recipe.goal ? 'complete' : ''}`}
                >
                  <span className="ingredient-emoji">{FOODS[kind].emoji}</span>
                  <div>
                    <strong>{FOODS[kind].name}</strong>
                    <span>
                      {Math.min(state?.counts[kind] || 0, recipe.goal)} / {recipe.goal}
                    </span>
                  </div>
                  {(state?.counts[kind] || 0) >= recipe.goal && <Check size={15} />}
                </div>
              ))}
            </div>
            <div className="trap-tip">
              <X size={17} />
              <span>
                Tout le reste ?<br />
                <b>On n’y touche pas.</b>
              </span>
            </div>
          </div>
          {(state?.phase === 'ready' || state?.phase === 'playing') && (
            <div className="trap-preview">
              <span>LES PIÈGES DE CETTE RECETTE</span>
              {recipe.traps.map((kind) => (
                <span key={kind}>
                  {FOODS[kind].emoji} {FOODS[kind].name}
                </span>
              ))}
            </div>
          )}
          {notice && <p role="status">{notice}</p>}
          {state?.phase === 'result' && (
            <div className="result-leaderboards">
              <Leaderboard
                variant="result"
                recipe={recipe.id}
                highlightEntryId={run.current?.eligible ? run.current.id : undefined}
                refreshKey={boardRevision}
              />
            </div>
          )}
        </main>
      )}

      {view !== 'game' && (
        <footer className="arcade-footer">
          <span>3 recettes · 3 cœurs · votre meilleur geste</span>
          <a href="/atelier" target="_blank" rel="noreferrer">
            Dans les coulisses du projet ↗
          </a>
          <span>ÉDITION SALON · V0.2</span>
        </footer>
      )}
      {dialog && (
        <Modal
          title={
            dialog === 'diagnostic'
              ? 'Diagnostic de connexion'
              : dialog === 'pair'
                ? 'Connecter mon téléphone'
                : dialog === 'help'
                  ? 'Comment jouer'
                  : dialog === 'board'
                    ? 'Classement du stand'
                    : 'Réglages'
          }
          onClose={() => setDialog(null)}
          className={dialog === 'board' ? 'leaderboard-dialog' : undefined}
        >
          {dialog === 'board' ? (
            <Leaderboard
              variant={view === 'game' ? 'result' : 'home'}
              recipe={recipe.id}
              highlightEntryId={run.current?.eligible ? run.current.id : undefined}
              refreshKey={boardRevision}
            />
          ) : dialog === 'pair' || dialog === 'diagnostic' ? (
            <PairDialog
              code={host.code}
              connected={host.connected}
              online={host.online}
              ready={phoneReady}
              source={phoneSource}
              error={host.error}
              onClose={() => setDialog(null)}
            />
          ) : dialog === 'help' ? (
            <div className="help-content">
              <span className="modal-symbol">
                <ChefHat size={30} />
              </span>
              <p className="eyebrow">LES RÈGLES DU DOJO</p>
              <h2>
                Devenez un ninja
                <br />
                des fourneaux.
              </h2>
              {[
                {
                  icon: Smartphone,
                  title: 'Connectez votre sabre.',
                  text: 'Scannez le QR code. Autorisez le gyroscope, puis recentrez en tenant votre téléphone devant vous. La souris est aussi disponible.',
                },
                {
                  icon: Leaf,
                  title: 'Coupez les bons ingrédients.',
                  text: 'Inclinez le téléphone pour viser, puis faites un petit mouvement rapide pour couper. Préparez toute la liste en 80 secondes. Un piège coûte un cœur : vous en avez trois.',
                },
                {
                  icon: RotateCcw,
                  title: 'Mélangez. Et régalez.',
                  text: 'Pendant 8 secondes, faites de petits cercles réguliers. Remplissez au moins 35 % de la jauge et servez votre création !',
                },
              ].map(({ icon: Icon, title, text }, i) => (
                <div className="help-step" key={title}>
                  <span>
                    <Icon size={23} />
                  </span>
                  <div>
                    <small>0{i + 1}</small>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </div>
              ))}
              <div className="network-note">
                <ShieldCheck size={21} />
                <span>
                  Tenez fermement le téléphone et gardez de l’espace autour de vous. De petits
                  gestes suffisent.
                </span>
              </div>
              <button
                className="button primary"
                onClick={() => {
                  setDialog(null);
                  navigate('recipes');
                }}
              >
                J’ai le coup de main <ArrowRight size={18} />
              </button>
            </div>
          ) : (
            <div className="settings-content">
              <p className="eyebrow">VOTRE CUISINE, VOS RÈGLES</p>
              <h2>Réglages</h2>
              <BladePicker value={blade} onChange={selectBlade} />
              <label className="setting-row" data-audio-control>
                <span>
                  <strong>Ambiance et bruitages</strong>
                  <small>Le son sort des haut-parleurs du PC.</small>
                </span>
                <input
                  type="checkbox"
                  checked={!muted}
                  onChange={(event) => {
                    if (event.target.checked) testAudio();
                    else {
                      audioTestAttempt.current++;
                      audio.muted = true;
                      setAudioNotice('');
                    }
                  }}
                />
              </label>
              <div className="audio-check" data-audio-control>
                <div>
                  <span className={`audio-status audio-status-${audioStatus}`}>
                    <i />
                    {muted
                      ? 'Son coupé'
                      : audioStatus === 'running'
                        ? 'Audio activé dans le navigateur'
                        : audioStatus === 'unavailable'
                          ? 'Audio indisponible · réessayez'
                          : 'Activation du son nécessaire'}
                  </span>
                  <button className="button secondary" onClick={testAudio}>
                    <Volume2 size={17} /> Tester le son sur le PC
                  </button>
                </div>
                {audioNotice && <p role="status">{audioNotice}</p>}
              </div>
              <label className="setting-row">
                <span>
                  <strong>Graphismes allégés</strong>
                  <small>
                    Moins de pixels pour les petits ordinateurs.
                    <br />
                    Changer ce réglage recommence la partie.
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={lowQuality}
                  onChange={(e) => setLowQuality(e.target.checked)}
                />
              </label>
              <p className="settings-footnote">
                Les records sont enregistrés sur le PC du stand. Les mouvements du téléphone sont
                relayés en direct, sans enregistrement.
              </p>
            </div>
          )}
        </Modal>
      )}
      {standActive && <StandMode onClose={closeStand} />}
    </div>
  );
}
