import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChefHat,
  ChevronDown,
  CircleHelp,
  Crosshair,
  Heart,
  Link2,
  LoaderCircle,
  MoveUpRight,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { clamp, MotionTracker, type MotionSample } from './motion';
import { TouchTracker } from './touch';
import type { GamePhase, GameStateMessage } from '../shared/protocol';
import { BLADES, DEFAULT_BLADE, type BladeId } from '../shared/blades';
import './controller.css';

type Connection = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';
type Mode = 'setup' | 'listening' | 'calibration' | 'motion' | 'touch';
type GameState = Omit<GameStateMessage, 'type'>;
type ControlChoice = 'motion' | 'touch';
type RemoteAction = 'start' | 'pause' | 'resume';
type PendingAction = { action: RemoteAction; requestedAt: number; notice: string };
type PermissionEventConstructor = { requestPermission?: () => Promise<'granted' | 'denied'> };
const INITIAL_SAMPLE: MotionSample = { x: 0.5, y: 0.5, slash: false, stir: 0 };
const INITIAL_GAME: GameState = {
  phase: 'menu',
  recipe: '',
  hearts: 3,
  score: 0,
  canStart: false,
  canResume: false,
  starting: false,
  blade: DEFAULT_BLADE,
  controlMode: 'motion',
  notice: '',
};
const PHASE_LABELS: Record<GamePhase, string> = {
  menu: 'Choisissez une recette sur le PC',
  ready: 'La cuisine vous attend',
  countdown: 'Le compte à rebours est lancé !',
  playing: 'À vous de trancher !',
  paused: 'Petite pause en cuisine',
  mixing: 'Mélangez, chef !',
  result: 'La recette est terminée',
};
const ERROR_LABELS: Record<string, string> = {
  ROOM_NOT_FOUND: 'Cette cuisine est introuvable. Vérifiez le code affiché sur le PC.',
  ROOM_FULL: 'Un téléphone est déjà connecté à cette cuisine.',
  ROOM_BUSY:
    'Ce code est déjà utilisé par un autre téléphone. Patientez ou demandez un nouveau code sur le PC.',
  CONTROLLER_EXISTS: 'Un téléphone est déjà connecté à cette cuisine.',
  INVALID_CODE: 'Le code doit comporter les 6 caractères affichés sur le PC.',
  RATE_LIMITED: 'Un peu trop de tentatives. Patientez un instant puis réessayez.',
  HOST_DISCONNECTED: 'Le PC a quitté la cuisine. Ouvrez une nouvelle connexion depuis le jeu.',
};

export default function Controller() {
  const [code, setCode] = useState(
    () =>
      new URLSearchParams(window.location.search)
        .get('room')
        ?.toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 6) ?? '',
  );
  const [room, setRoom] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [connection, setConnection] = useState<Connection>('idle');
  const [connectionError, setConnectionError] = useState('');
  const [mode, setMode] = useState<Mode>('setup');
  const [sensorError, setSensorError] = useState('');
  const [sensorStatus, setSensorStatus] = useState({ orientation: false, gyroscope: false });
  const [game, setGame] = useState<GameState>(INITIAL_GAME);
  const [controlChoice, setControlChoice] = useState<ControlChoice>('motion');
  const [blade, setBlade] = useState<BladeId>(DEFAULT_BLADE);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionNotice, setActionNotice] = useState('');
  const [sensitivity, setSensitivity] = useState(1);
  const [helpOpen, setHelpOpen] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [calibrationRequested, setCalibrationRequested] = useState(false);
  const [wakeStatus, setWakeStatus] = useState<'off' | 'active' | 'unavailable'>('off');
  const ws = useRef<WebSocket | null>(null);
  const tracker = useRef(new MotionTracker());
  const cleanupSensors = useRef<() => void>(() => {});
  const seq = useRef(0);
  const modeRef = useRef<Mode>(mode);
  const connectedRef = useRef(false);
  const gameRef = useRef(game);
  const settingsRef = useRef({ mode: controlChoice, blade });
  const pendingActionRef = useRef<PendingAction | null>(null);
  const touch = useRef(new TouchTracker());
  const pad = useRef<HTMLDivElement | null>(null);
  const reticle = useRef<HTMLSpanElement | null>(null);
  const stirMeter = useRef<HTMLSpanElement | null>(null);
  const padBounds = useRef<DOMRect | null>(null);
  const touchClient = useRef<{ x: number; y: number } | null>(null);
  const sensorAttempt = useRef(0);
  const pendingCalibration = useRef(false);
  const calibrationStartedAt = useRef(0);
  modeRef.current = mode;
  connectedRef.current = connection === 'connected';
  gameRef.current = game;

  const clearPendingAction = useCallback(() => {
    pendingActionRef.current = null;
    setPendingAction(null);
  }, []);

  const neutralizeControls = useCallback(() => {
    // Stop the timer synchronously, including while a permission prompt is open.
    modeRef.current = 'setup';
    touch.current.reset();
  }, []);

  const sendSettings = useCallback((choice: ControlChoice, selectedBlade: BladeId) => {
    settingsRef.current = { mode: choice, blade: selectedBlade };
    if (connectedRef.current && ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(
        JSON.stringify({
          type: 'controller:settings',
          mode: choice,
          blade: selectedBlade,
        }),
      );
    }
  }, []);

  const stopSensors = useCallback(() => {
    sensorAttempt.current += 1;
    cleanupSensors.current();
    cleanupSensors.current = () => {};
    pendingCalibration.current = false;
  }, []);

  useEffect(() => {
    if (!room) return;
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let retries = 0;
    let terminalError = false;
    let awaitingHostSettings = false;
    let socket: WebSocket | null = null;
    let resumeToken: string | undefined;
    try {
      resumeToken = sessionStorage.getItem(`cookingninja:resume:${room}`) || undefined;
    } catch {
      /* Memory-only reconnect remains available. */
    }
    const connect = () => {
      if (disposed) return;
      connectedRef.current = false;
      awaitingHostSettings = false;
      clearPendingAction();
      setActionNotice('');
      setGame((current) => ({ ...current, canStart: false, canResume: false, starting: false }));
      setConnection(retries ? 'reconnecting' : 'connecting');
      setConnectionError('');
      socket = new WebSocket(
        `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/relay`,
      );
      ws.current = socket;
      socket.onopen = () => {
        if (!disposed)
          socket?.send(JSON.stringify({ type: 'controller:join', code: room, resumeToken }));
      };
      socket.onmessage = (event) => {
        if (disposed) return;
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(event.data as string) as Record<string, unknown>;
        } catch {
          return;
        }
        if (!message || typeof message !== 'object' || Array.isArray(message)) return;
        if (message.type === 'room:joined') {
          if (typeof message.resumeToken === 'string') {
            resumeToken = message.resumeToken;
            try {
              sessionStorage.setItem(`cookingninja:resume:${room}`, resumeToken);
            } catch {
              /* Optional session storage. */
            }
          }
          retries = 0;
          connectedRef.current = true;
          setConnection('connected');
          setConnectionError('');
          // Adopt the PC's saved blade before announcing this phone's input mode.
          awaitingHostSettings = true;
        } else if (message.type === 'peer:status') {
          if (message.connected === false) {
            terminalError = true;
            connectedRef.current = false;
            clearPendingAction();
            setConnection('error');
            setConnectionError(
              'Le PC a quitté la cuisine. Reconnectez-vous avec le code affiché dans le jeu.',
            );
            socket?.close();
          }
        } else if (message.type === 'game:state') {
          if (
            typeof message.phase === 'string' &&
            Object.hasOwn(PHASE_LABELS, message.phase) &&
            typeof message.recipe === 'string' &&
            typeof message.hearts === 'number' &&
            Number.isInteger(message.hearts) &&
            typeof message.score === 'number' &&
            Number.isFinite(message.score)
          ) {
            const selectedBlade = BLADES.some((item) => item.id === message.blade)
              ? (message.blade as BladeId)
              : settingsRef.current.blade;
            const next: GameState = {
              phase: message.phase as GamePhase,
              recipe: message.recipe,
              hearts: clamp(message.hearts, 0, 3),
              score: Math.max(0, message.score),
              canStart: message.canStart === true,
              canResume: message.canResume === true,
              starting: message.starting === true,
              blade: selectedBlade,
              controlMode:
                message.controlMode === 'touch' || message.controlMode === 'mouse'
                  ? message.controlMode
                  : 'motion',
              notice: typeof message.notice === 'string' ? message.notice : '',
            };
            if (next.phase !== gameRef.current.phase) {
              const continuous =
                (gameRef.current.phase === 'countdown' && next.phase === 'playing') ||
                (gameRef.current.phase === 'playing' && next.phase === 'mixing');
              if (continuous) {
                const now = performance.now();
                const position = touch.current.visual(now);
                touch.current.rebase(position.x, position.y, now);
              } else touch.current.cancel();
            }
            gameRef.current = next;
            setGame((current) =>
              Object.keys(next).every(
                (key) => current[key as keyof GameState] === next[key as keyof GameState],
              )
                ? current
                : next,
            );
            settingsRef.current.blade = selectedBlade;
            setBlade(selectedBlade);
            if (awaitingHostSettings) {
              awaitingHostSettings = false;
              socket?.send(JSON.stringify({ type: 'controller:settings', ...settingsRef.current }));
            }
            const pending = pendingActionRef.current;
            if (pending) {
              const running = ['countdown', 'playing', 'mixing'].includes(next.phase);
              const confirmed =
                pending.action === 'pause' ? !running : running || next.phase === 'result';
              const declined = !next.starting && next.notice !== pending.notice && !!next.notice;
              if (confirmed || declined) {
                clearPendingAction();
                setActionNotice('');
              }
            }
          }
        } else if (message.type === 'error') {
          terminalError = message.recoverable !== true;
          connectedRef.current = false;
          clearPendingAction();
          const key = String(message.code ?? '').toUpperCase();
          setConnectionError(
            ERROR_LABELS[key] ??
              (typeof message.message === 'string'
                ? message.message
                : 'La connexion a été refusée. Vérifiez le code puis réessayez.'),
          );
          setConnection(terminalError ? 'error' : 'reconnecting');
          socket?.close();
        }
      };
      socket.onclose = (event) => {
        if (disposed || terminalError) return;
        connectedRef.current = false;
        clearPendingAction();
        if (event.code === 4001) {
          terminalError = true;
          setConnection('error');
          setConnectionError(
            'La commande a été reprise dans un autre onglet. Gardez un seul onglet de jeu ouvert.',
          );
          setGame((current) => ({
            ...current,
            canStart: false,
            canResume: false,
            starting: false,
          }));
          return;
        }
        retries += 1;
        setConnection('reconnecting');
        setConnectionError('Connexion interrompue. Nous essayons de retrouver votre cuisine…');
        retry = setTimeout(connect, Math.min(1000 * 2 ** (retries - 1), 8000));
      };
      socket.onerror = () => socket?.close();
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      if (socket) {
        const closingSocket = socket;
        closingSocket.onmessage = null;
        closingSocket.onclose = null;
        closingSocket.onerror = null;
        if (closingSocket.readyState === WebSocket.CONNECTING) {
          // React StrictMode may clean up before the handshake completes.
          // Close immediately after open without joining or aborting the handshake.
          closingSocket.onopen = () => {
            closingSocket.onopen = null;
            closingSocket.close();
          };
        } else {
          closingSocket.onopen = null;
          closingSocket.close();
        }
      }
      if (ws.current === socket) ws.current = null;
    };
  }, [room, attempt, clearPendingAction]);

  useEffect(() => {
    if (!pendingAction) return;
    const timeout = setTimeout(() => {
      if (pendingActionRef.current !== pendingAction) return;
      clearPendingAction();
      setActionNotice('Le PC n’a pas confirmé la commande. Vérifiez son écran avant de réessayer.');
    }, 8000);
    return () => clearTimeout(timeout);
  }, [pendingAction, clearPendingAction]);

  // A screen lock is best-effort: the OS may reject/revoke it, so the input watchdog remains active.
  useEffect(() => {
    if (
      connection !== 'connected' ||
      !['motion', 'touch', 'calibration'].includes(mode) ||
      game.phase === 'result'
    ) {
      setWakeStatus('off');
      return;
    }
    let disposed = false;
    let sentinel: WakeLockSentinel | null = null;
    let requesting = false;
    const acquire = async () => {
      if (disposed || document.hidden || requesting || sentinel) return;
      if (!('wakeLock' in navigator)) {
        setWakeStatus('unavailable');
        return;
      }
      requesting = true;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (disposed || document.hidden) {
          await lock.release();
          return;
        }
        sentinel = lock;
        setWakeStatus('active');
        lock.addEventListener('release', () => {
          if (sentinel === lock) sentinel = null;
          if (!disposed) setWakeStatus('unavailable');
        });
      } catch {
        if (!disposed) setWakeStatus('unavailable');
      } finally {
        requesting = false;
      }
    };
    const visibility = () => {
      if (document.hidden) {
        const lock = sentinel;
        sentinel = null;
        void lock?.release().catch(() => {});
      } else void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', visibility);
      void sentinel?.release().catch(() => {});
    };
  }, [connection, mode, game.phase]);

  useEffect(() => {
    const onVisibility = () => {
      setHidden(document.hidden);
      touch.current.cancel();
      if (!document.hidden && modeRef.current === 'motion') {
        tracker.current.beginCalibration();
        calibrationStartedAt.current = performance.now();
        pendingCalibration.current = true;
        setCalibrationRequested(true);
        setMode('calibration');
      }
    };
    const onScreenRotation = () => {
      touch.current.cancel();
      if (modeRef.current === 'motion') {
        tracker.current.beginCalibration();
        calibrationStartedAt.current = performance.now();
        pendingCalibration.current = true;
        setCalibrationRequested(true);
        setMode('calibration');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('orientationchange', onScreenRotation);
    let lastCalibrationPaint = -Infinity;
    const tick = setInterval(() => {
      if (document.hidden) return;
      const now = performance.now();
      const currentMode = modeRef.current;
      if (currentMode === 'calibration') {
        const status = tracker.current.calibrationStatus(now);
        if (now - lastCalibrationPaint >= 100) {
          lastCalibrationPaint = now;
          setCalibrationProgress(Math.round(status.progress * 20) / 20);
        }
        if (
          pendingCalibration.current &&
          (status.reason === 'stale' ||
            (status.reason === 'missing' && now - calibrationStartedAt.current > 1500))
        ) {
          setSensorError(
            'Inclinez légèrement le téléphone, puis gardez-le immobile pour retrouver le centre.',
          );
        }
        if (pendingCalibration.current && status.ready && tracker.current.calibrate(now)) {
          pendingCalibration.current = false;
          setCalibrationRequested(false);
          setSensorError('');
          modeRef.current = 'motion';
          setMode('motion');
        }
      }
      const sensorsFresh = tracker.current.isFresh(now);
      if (currentMode === 'motion' && !sensorsFresh) {
        tracker.current.beginCalibration();
        calibrationStartedAt.current = now;
        pendingCalibration.current = true;
        setCalibrationRequested(true);
        setSensorError(
          'Mouvement interrompu. Inclinez légèrement le téléphone, puis gardez-le immobile pour reprendre.',
        );
        modeRef.current = 'calibration';
        setMode('calibration');
      }
      if (
        (currentMode === 'touch' ||
          (currentMode === 'motion' && sensorsFresh && !pendingCalibration.current)) &&
        connectedRef.current &&
        ws.current?.readyState === WebSocket.OPEN &&
        ws.current.bufferedAmount === 0
      ) {
        // Consume a touch segment only when it can actually be sent.
        const next =
          currentMode === 'touch' ? touch.current.take(now) : tracker.current.sample(now);
        ws.current.send(
          JSON.stringify({
            type: 'input',
            ...next,
            source: currentMode === 'touch' ? 'touch' : 'motion',
            seq: seq.current++,
          }),
        );
      }
    }, 34); // Below 30 Hz, including the timer's integer-millisecond rounding.
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('orientationchange', onScreenRotation);
      stopSensors();
    };
  }, [stopSensors]);

  // The local cursor follows the display clock without rerendering the controller.
  // Geometry is measured on layout changes / touch-down, never for every pointer move.
  useEffect(() => {
    if (!pad.current || !['motion', 'touch'].includes(mode) || connection !== 'connected' || hidden)
      return;
    const surface = pad.current;
    const measure = () => {
      const bounds = surface.getBoundingClientRect();
      const previous = padBounds.current;
      if (
        previous &&
        (Math.abs(previous.width - bounds.width) > 0.5 ||
          Math.abs(previous.height - bounds.height) > 0.5 ||
          Math.abs(previous.left - bounds.left) > 0.5 ||
          Math.abs(previous.top - bounds.top) > 0.5)
      ) {
        const now = performance.now();
        const client = touch.current.pointerId !== null ? touchClient.current : null;
        const position = touch.current.visual(now);
        // Browser chrome / HUD changes can resize the pad while the finger stays down.
        // Reproject that same physical point, without cutting the layout's displacement.
        touch.current.rebase(
          client && bounds.width ? (client.x - bounds.left) / bounds.width : position.x,
          client && bounds.height ? (client.y - bounds.top) / bounds.height : position.y,
          now,
        );
      }
      padBounds.current = bounds;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    let frame = 0;
    let lastTransform = '';
    let lastCut = false;
    let lastStir = '';
    const draw = (time: number) => {
      const current =
        modeRef.current === 'touch'
          ? touch.current.visual(time)
          : modeRef.current === 'motion'
            ? tracker.current.sample(time)
            : INITIAL_SAMPLE;
      const bounds = padBounds.current;
      if (reticle.current && bounds) {
        const transform = `translate3d(${(current.x * bounds.width).toFixed(1)}px, ${(current.y * bounds.height).toFixed(1)}px, 0) translate(-50%, -50%)`;
        if (transform !== lastTransform) {
          reticle.current.style.transform = transform;
          lastTransform = transform;
        }
        if (current.slash !== lastCut) {
          reticle.current.classList.toggle('is-cutting', current.slash);
          lastCut = current.slash;
        }
      }
      const energy = `scaleX(${current.stir.toFixed(2)})`;
      if (stirMeter.current && energy !== lastStir) {
        stirMeter.current.style.transform = energy;
        lastStir = energy;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      touch.current.cancel();
      reticle.current?.classList.remove('is-cutting');
    };
  }, [mode, connection, hidden]);

  const activateSensors = async () => {
    neutralizeControls();
    stopSensors();
    setMode('listening');
    setControlChoice('motion');
    sendSettings('motion', settingsRef.current.blade);
    clearPendingAction();
    setActionNotice('');
    const currentAttempt = sensorAttempt.current;
    setSensorError('');
    setCalibrationRequested(false);
    setCalibrationProgress(0);
    setSensorStatus({ orientation: false, gyroscope: false });
    if (!window.isSecureContext) {
      setSensorError(
        'Les capteurs nécessitent une adresse HTTPS. Ouvrez le lien sécurisé affiché sur le PC, ou utilisez le pavé tactile.',
      );
      setMode('setup');
      return;
    }
    if (typeof window.DeviceOrientationEvent === 'undefined') {
      setSensorError(
        'Ce navigateur ne propose pas les capteurs d’orientation. Le pavé tactile reste disponible.',
      );
      setMode('setup');
      return;
    }
    try {
      // Both requests are started inside the same click's transient activation.
      const orientationConstructor =
        window.DeviceOrientationEvent as unknown as PermissionEventConstructor;
      const motionConstructor = window.DeviceMotionEvent as unknown as
        PermissionEventConstructor | undefined;
      const permissions = await Promise.allSettled([
        orientationConstructor.requestPermission?.() ?? Promise.resolve('granted'),
        motionConstructor?.requestPermission?.() ?? Promise.resolve('granted'),
      ]);
      if (currentAttempt !== sensorAttempt.current) return;
      if (permissions[0].status !== 'fulfilled' || permissions[0].value !== 'granted') {
        setSensorError(
          'L’accès au mouvement a été refusé. Autorisez-le dans votre navigateur puis réessayez, ou passez au pavé tactile.',
        );
        setMode('setup');
        return;
      }
      tracker.current = new MotionTracker();
      tracker.current.sensitivity = sensitivity;
      setMode('listening');
      let received = false;
      let gyroReceived = false;
      const orientation = (event: DeviceOrientationEvent) => {
        if (
          document.hidden ||
          event.beta === null ||
          event.gamma === null ||
          !Number.isFinite(event.beta) ||
          !Number.isFinite(event.gamma)
        )
          return;
        tracker.current.orientation(
          event.beta,
          event.gamma,
          performance.now(),
          window.screen.orientation?.angle ?? 0,
        );
        if (!received) {
          received = true;
          setSensorStatus((status) => ({ ...status, orientation: true }));
          setMode('calibration');
        }
      };
      const motion = (event: DeviceMotionEvent) => {
        if (document.hidden) return;
        tracker.current.motion(event, performance.now());
        const rate = event.rotationRate;
        if (
          !gyroReceived &&
          rate &&
          [rate.beta, rate.gamma].every(
            (value) => typeof value === 'number' && Number.isFinite(value),
          )
        ) {
          gyroReceived = true;
          setSensorStatus((status) => ({ ...status, gyroscope: true }));
        }
      };
      window.addEventListener('deviceorientation', orientation);
      if (permissions[1].status === 'fulfilled' && permissions[1].value === 'granted')
        window.addEventListener('devicemotion', motion);
      const timeout = setTimeout(() => {
        if (received) return;
        stopSensors();
        setSensorError(
          'Aucun mouvement reçu. Vérifiez les autorisations du navigateur et inclinez légèrement le téléphone, puis réessayez.',
        );
        setMode('setup');
      }, 5000);
      cleanupSensors.current = () => {
        window.removeEventListener('deviceorientation', orientation);
        window.removeEventListener('devicemotion', motion);
        clearTimeout(timeout);
      };
    } catch {
      if (currentAttempt !== sensorAttempt.current) return;
      setSensorError(
        'Impossible d’activer les capteurs. Vérifiez les autorisations du navigateur ou utilisez le pavé tactile.',
      );
      setMode('setup');
    }
  };

  const useTouch = () => {
    neutralizeControls();
    stopSensors();
    tracker.current.beginCalibration();
    setControlChoice('touch');
    sendSettings('touch', settingsRef.current.blade);
    modeRef.current = 'touch';
    setMode('touch');
    setSensorError('');
    setCalibrationRequested(false);
    setCalibrationProgress(0);
    clearPendingAction();
    setActionNotice('');
  };
  const calibrate = () => {
    neutralizeControls();
    tracker.current.beginCalibration();
    calibrationStartedAt.current = performance.now();
    pendingCalibration.current = true;
    setCalibrationRequested(true);
    setSensorError('');
    modeRef.current = 'calibration';
    setMode('calibration');
  };
  const chooseBlade = (selected: BladeId) => {
    setBlade(selected);
    sendSettings(settingsRef.current.mode, selected);
    setActionNotice('');
  };
  const requestAction = (action: RemoteAction) => {
    const currentGame = gameRef.current;
    const ready =
      modeRef.current === 'touch' ||
      (modeRef.current === 'motion' &&
        tracker.current.isFresh(performance.now()) &&
        !pendingCalibration.current);
    if (
      !connectedRef.current ||
      document.hidden ||
      pendingActionRef.current ||
      ws.current?.readyState !== WebSocket.OPEN ||
      ws.current.bufferedAmount > 1024 ||
      (action !== 'pause' && !ready) ||
      (action === 'start' && (!currentGame.canStart || currentGame.starting)) ||
      (action === 'resume' && !currentGame.canResume) ||
      (action === 'pause' && !['countdown', 'playing', 'mixing'].includes(currentGame.phase))
    )
      return;
    const pending = { action, requestedAt: performance.now(), notice: currentGame.notice };
    pendingActionRef.current = pending;
    setPendingAction(pending);
    setActionNotice('');
    ws.current.send(JSON.stringify({ type: 'controller:action', action }));
  };
  const leave = () => {
    neutralizeControls();
    stopSensors();
    const canLeave = ws.current?.readyState === WebSocket.OPEN;
    if (canLeave) ws.current?.send(JSON.stringify({ type: 'controller:leave' }));
    if (room && canLeave) {
      try {
        sessionStorage.removeItem(`cookingninja:resume:${room}`);
      } catch {
        /* Optional session storage. */
      }
    }
    setRoom(null);
    setConnection('idle');
    setConnectionError('');
    setMode('setup');
    connectedRef.current = false;
    clearPendingAction();
    setActionNotice('');
    setControlChoice('motion');
    settingsRef.current.mode = 'motion';
    setGame(INITIAL_GAME);
  };

  const moveTouch = (event: PointerEvent<HTMLDivElement>) => {
    if (modeRef.current !== 'touch' || document.hidden) return;
    if (event.type === 'pointerdown') {
      if (touch.current.pointerId !== null) return;
      padBounds.current = event.currentTarget.getBoundingClientRect();
      const bounds = padBounds.current;
      if (!bounds.width || !bounds.height) return;
      if (
        !touch.current.begin(
          event.pointerId,
          (event.clientX - bounds.left) / bounds.width,
          (event.clientY - bounds.top) / bounds.height,
          performance.now(),
        )
      )
        return;
      touchClient.current = { x: event.clientX, y: event.clientY };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (touch.current.pointerId !== event.pointerId) return;
    const bounds = padBounds.current;
    if (!bounds?.width || !bounds.height) return;
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const point of coalesced.length ? coalesced : [event.nativeEvent]) {
      touchClient.current = { x: point.clientX, y: point.clientY };
      const now = performance.now();
      const time =
        point.timeStamp > 0 && Math.abs(now - point.timeStamp) < 1000 ? point.timeStamp : now;
      touch.current.move(
        event.pointerId,
        (point.clientX - bounds.left) / bounds.width,
        (point.clientY - bounds.top) / bounds.height,
        time,
      );
    }
  };
  const endTouch = (event: PointerEvent<HTMLDivElement>) => {
    if (touch.current.pointerId === event.pointerId) touchClient.current = null;
    const bounds = padBounds.current;
    if (event.type === 'pointerup' && bounds?.width && bounds.height) {
      touch.current.end(
        event.pointerId,
        (event.clientX - bounds.left) / bounds.width,
        (event.clientY - bounds.top) / bounds.height,
        performance.now(),
      );
    } else touch.current.cancel(event.pointerId);
  };
  const isActive = mode === 'motion' || mode === 'touch';
  const recipeName = game.recipe;
  const selectedBlade = BLADES.find((item) => item.id === blade) ?? BLADES[0];
  const localReady =
    !hidden &&
    (mode === 'touch' ||
      (mode === 'motion' &&
        tracker.current.isFresh(performance.now()) &&
        !pendingCalibration.current));
  const running = ['countdown', 'playing', 'mixing'].includes(game.phase);
  const remoteAction: RemoteAction = running
    ? 'pause'
    : game.phase === 'paused'
      ? 'resume'
      : 'start';
  const actionEnabled =
    connection === 'connected' &&
    !hidden &&
    !pendingAction &&
    (remoteAction === 'pause' ||
      (localReady &&
        !game.starting &&
        (remoteAction === 'resume' ? game.canResume : game.canStart)));
  const actionLabel = pendingAction
    ? pendingAction.action === 'pause'
      ? 'Pause demandée…'
      : 'Le PC prépare la suite…'
    : game.starting
      ? 'Le PC prépare la partie…'
      : running
        ? 'Mettre en pause'
        : game.phase === 'paused'
          ? 'Reprendre la partie'
          : game.canStart
            ? 'Lancer la partie'
            : !localReady
              ? controlChoice === 'motion'
                ? 'Calibrez votre lame'
                : 'Préparez les commandes'
              : game.phase === 'result'
                ? 'Recette terminée !'
                : 'En attente du PC';

  return (
    <div
      className={`cn-controller ${isActive && connection === 'connected' ? 'cn-is-active' : ''} ${connection === 'connected' ? 'cn-has-dock' : ''}`}
      style={
        {
          '--cn-blade': selectedBlade.color,
          '--cn-blade-glow': selectedBlade.glow,
        } as CSSProperties
      }
    >
      <header className="cn-mobile-header">
        <a className="cn-mobile-brand" href="/" aria-label="CookingNinja, accueil">
          <span>
            <ChefHat size={23} strokeWidth={1.8} />
          </span>
          Cooking<span className="cn-brand-accent">Ninja</span>
          <i />
        </a>
        <button
          className="cn-icon-button"
          onClick={() => setHelpOpen(!helpOpen)}
          aria-label={helpOpen ? 'Fermer l’aide' : 'Comment jouer ?'}
        >
          {helpOpen ? <X size={21} /> : <CircleHelp size={21} />}
        </button>
      </header>

      {helpOpen && (
        <aside className="cn-help-panel">
          <strong>Le téléphone devient votre couteau.</strong>
          <p>
            Inclinez-le pour viser, puis faites un petit geste vif pour couper. À la fin, faites de
            petits cercles pour mélanger. Gardez les yeux sur le PC et tenez fermement votre
            téléphone.
          </p>
          <p>
            Le mouvement contrôle un curseur : il ne mesure pas la position de votre main dans la
            pièce.
          </p>
          {wakeStatus === 'unavailable' && <p>Gardez l’écran allumé pendant la partie.</p>}
        </aside>
      )}

      <main className="cn-controller-main">
        {!room ? (
          <>
            <div className="cn-mobile-eyebrow">
              <span /> VOTRE TÉLÉPHONE. VOTRE COUTEAU.
            </div>
            <h1>
              La cuisine est
              <br />
              entre vos <em>mains.</em>
            </h1>
            <p className="cn-mobile-lead">
              Une pincée de mouvement.
              <br />
              Une bonne dose de fun.
            </p>
            <div className="cn-phone-illustration" aria-hidden="true">
              <span className="cn-orbit cn-orbit-one" />
              <span className="cn-orbit cn-orbit-two" />
              <div className="cn-phone-shape">
                <div className="cn-phone-camera" />
                <ChefHat size={43} strokeWidth={1.3} />
                <span>LET’S COOK</span>
                <div className="cn-phone-bottom" />
              </div>
              <div className="cn-illustration-badge">
                <Zap size={20} fill="currentColor" />
              </div>
              <Sparkles className="cn-sparkle" size={24} />
            </div>
            <form
              className="cn-join-card"
              onSubmit={(event) => {
                event.preventDefault();
                if (code.length === 6) {
                  setRoom(code);
                  setConnection('connecting');
                }
              }}
            >
              <div className="cn-card-heading">
                <span className="cn-step-number">01</span>
                <div>
                  <h2>Rejoignez votre cuisine</h2>
                  <p>Le code est affiché sur l’écran du PC.</p>
                </div>
              </div>
              <label htmlFor="kitchen-code" className="cn-sr-only">
                Code de connexion à 6 caractères
              </label>
              <input
                id="kitchen-code"
                className="cn-code-input"
                value={code}
                onChange={(event) =>
                  setCode(
                    event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, '')
                      .slice(0, 6),
                  )
                }
                placeholder="ABCDEF"
                maxLength={6}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                inputMode="text"
                required
                pattern="[A-Z0-9]{6}"
              />
              <button
                className="cn-button cn-button-primary"
                type="submit"
                disabled={code.length !== 6}
              >
                Entrer en cuisine <ArrowRight size={19} />
              </button>
            </form>
            <p className="cn-privacy-note">
              <ShieldCheck size={15} /> Aucune application à installer. Aucune donnée de mouvement
              sauvegardée.
            </p>
          </>
        ) : (
          <>
            <div className="cn-room-bar">
              <button className="cn-back-button" onClick={leave} aria-label="Quitter cette cuisine">
                <ArrowLeft size={18} />
              </button>
              <span>
                CUISINE <strong>{room}</strong>
              </span>
              <span
                className={`cn-connection-pill ${connection === 'connected' ? 'is-connected' : ''}`}
              >
                {connection === 'connected' ? <Wifi size={13} /> : <WifiOff size={13} />}
                {connection === 'connected' ? 'Connecté' : 'Connexion'}
              </span>
            </div>

            {connection !== 'connected' ? (
              <section className="cn-status-card" aria-live="polite">
                {connection === 'error' ? (
                  <WifiOff size={37} />
                ) : (
                  <LoaderCircle size={37} className="cn-spin" />
                )}
                <h1>
                  {connection === 'error'
                    ? 'Cuisine introuvable ?'
                    : connection === 'reconnecting'
                      ? 'On se retrouve…'
                      : 'Juste un instant…'}
                </h1>
                <p>{connectionError || 'Votre téléphone rejoint le PC.'}</p>
                {connection === 'error' && (
                  <button
                    className="cn-button cn-button-primary"
                    onClick={() => setAttempt((value) => value + 1)}
                  >
                    Réessayer <RotateCcw size={18} />
                  </button>
                )}
                <button className="cn-text-button" onClick={leave}>
                  Saisir un autre code
                </button>
              </section>
            ) : (
              <>
                <details className="cn-blade-picker">
                  <summary>
                    <svg className="cn-blade-preview" viewBox="0 0 86 46" aria-hidden="true">
                      <path className="cn-blade-aura" d="M8 36 Q37 32 74 7" />
                      <path className="cn-blade-stroke" d="M8 36 Q37 32 74 7" />
                      <path className="cn-blade-spark" d="M68 5v12m-6-6h12" />
                    </svg>
                    <span>
                      RÉGLAGES<strong>{selectedBlade.name}</strong>
                    </span>
                    <span className="cn-blade-change">
                      Changer <ChevronDown size={16} />
                    </span>
                  </summary>
                  <div
                    className="cn-blade-choices"
                    role="group"
                    aria-label="Choisir la couleur de la lame"
                  >
                    {BLADES.map((item) => (
                      <button
                        key={item.id}
                        className={`cn-blade-choice ${blade === item.id ? 'is-selected' : ''}`}
                        style={
                          {
                            '--cn-choice-color': item.color,
                            '--cn-choice-glow': item.glow,
                          } as CSSProperties
                        }
                        aria-pressed={blade === item.id}
                        title={item.description}
                        onClick={() => chooseBlade(item.id)}
                      >
                        <span className="cn-blade-swatch">
                          {blade === item.id && <Check size={16} />}
                        </span>
                        <strong>{item.name}</strong>
                        <small>{item.description}</small>
                      </button>
                    ))}
                  </div>
                  {mode === 'motion' && (
                    <label className="cn-sensitivity">
                      <span>
                        Sensibilité <strong>{sensitivity.toFixed(1)}×</strong>
                      </span>
                      <input
                        type="range"
                        min="0.6"
                        max="1.8"
                        step="0.1"
                        value={sensitivity}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          setSensitivity(value);
                          tracker.current.sensitivity = value;
                        }}
                      />
                    </label>
                  )}
                </details>
                {(actionNotice ||
                  (game.notice && !running && !game.canStart && !game.canResume)) && (
                  <p className={`cn-host-notice ${actionNotice ? 'is-warning' : ''}`} role="status">
                    {actionNotice || game.notice}
                  </p>
                )}
                {!isActive ? (
                  <>
                    <div className="cn-mobile-eyebrow">
                      <span /> CONNEXION RÉUSSIE
                    </div>
                    <h1>
                      À vos marques,
                      <br />
                      <em>chef ninja.</em>
                    </h1>
                    <p className="cn-mobile-lead">
                      Un petit mouvement suffit.
                      <br />
                      Le talent, c’est vous.
                    </p>
                    <section className="cn-sensor-card">
                      <div
                        className={`cn-sensor-visual ${mode === 'listening' ? 'is-listening' : ''}`}
                      >
                        <Smartphone size={65} strokeWidth={1.3} />
                        <MoveUpRight size={25} className="cn-motion-arrow" />
                      </div>
                      <h2>
                        {mode === 'calibration'
                          ? calibrationRequested
                            ? 'Un instant, sans bouger…'
                            : 'Trouvez votre position'
                          : mode === 'listening'
                            ? 'À l’écoute du mouvement…'
                            : 'Activez votre couteau'}
                      </h2>
                      <p>
                        {mode === 'calibration'
                          ? 'Tenez le téléphone confortablement devant vous. Gardez-le immobile un court instant.'
                          : mode === 'listening'
                            ? 'Inclinez doucement le téléphone pour vérifier les capteurs.'
                            : 'Autorisez les capteurs de mouvement, puis centrez votre téléphone.'}
                      </p>
                      {sensorStatus.orientation && (
                        <div className="cn-sensor-status">
                          <Check size={12} />
                          Orientation reçue<span>·</span>
                          {sensorStatus.gyroscope ? 'Gyroscope reçu' : 'Rotation estimée'}
                        </div>
                      )}
                      {sensorError && (
                        <p className="cn-inline-error" role="alert">
                          {sensorError}
                        </p>
                      )}
                      {mode === 'calibration' ? (
                        <>
                          <div
                            className="cn-calibration-track"
                            role="progressbar"
                            aria-label="Stabilité du téléphone"
                            aria-valuenow={Math.round(calibrationProgress * 100)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <span style={{ transform: `scaleX(${calibrationProgress})` }} />
                          </div>
                          <button
                            className="cn-button cn-button-primary"
                            onClick={calibrate}
                            disabled={calibrationRequested}
                          >
                            {calibrationRequested ? 'Centrage en cours…' : 'Centrer mon couteau'}{' '}
                            <Crosshair size={19} />
                          </button>
                          {sensorError && (
                            <button className="cn-text-button" onClick={activateSensors}>
                              Réactiver les capteurs
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          className="cn-button cn-button-primary"
                          onClick={activateSensors}
                          disabled={mode === 'listening'}
                        >
                          {mode === 'listening'
                            ? 'Détection en cours'
                            : sensorError
                              ? 'Réessayer les capteurs'
                              : 'Activer le mouvement'}
                          {mode === 'listening' ? (
                            <LoaderCircle size={19} className="cn-spin" />
                          ) : (
                            <Zap size={19} />
                          )}
                        </button>
                      )}
                      <button className="cn-text-button" onClick={useTouch}>
                        Jouer au pavé tactile
                      </button>
                    </section>
                  </>
                ) : (
                  <>
                    <div className="cn-play-topline">
                      <div className="cn-play-recipe">
                        <span>{mode === 'motion' ? 'GYROSCOPE' : 'TACTILE'}</span>
                        <strong>{recipeName || 'Terrain d’essai'}</strong>
                      </div>
                      <div className="cn-controller-score">
                        <span>
                          <Heart size={16} fill="currentColor" />
                          {Math.max(0, Math.min(3, game.hearts ?? 3))}
                          <small className="cn-sr-only">VIES</small>
                        </span>
                        <span>
                          <Sparkles size={16} />
                          {game.score ?? 0}
                          <small className="cn-sr-only">POINTS</small>
                        </span>
                      </div>
                    </div>
                    <div
                      ref={pad}
                      className={`cn-control-pad ${mode === 'touch' ? 'is-touch' : ''} ${game.phase === 'mixing' ? 'is-mixing' : ''}`}
                      onPointerDown={mode === 'touch' ? moveTouch : undefined}
                      onPointerMove={mode === 'touch' ? moveTouch : undefined}
                      onPointerUp={endTouch}
                      onPointerCancel={endTouch}
                      onLostPointerCapture={endTouch}
                      role="img"
                      aria-label={
                        mode === 'touch'
                          ? 'Pavé tactile : glissez le doigt pour couper, faites des cercles pour mélanger.'
                          : 'Position du curseur contrôlé par le mouvement du téléphone.'
                      }
                    >
                      <span className="cn-pad-corner cn-corner-tl" />
                      <span className="cn-pad-corner cn-corner-tr" />
                      <span className="cn-pad-corner cn-corner-bl" />
                      <span className="cn-pad-corner cn-corner-br" />
                      <div className="cn-pad-ring" />
                      <div className="cn-pad-ring cn-pad-ring-inner" />
                      <span ref={reticle} className="cn-reticle">
                        <Crosshair size={33} strokeWidth={1.4} />
                      </span>
                      {game.phase !== 'playing' && game.phase !== 'mixing' && (
                        <span className="cn-pad-state">
                          {game.phase === 'paused'
                            ? 'En pause'
                            : game.phase === 'countdown'
                              ? 'Regardez le PC'
                              : game.phase === 'result'
                                ? 'Bien joué !'
                                : 'Testez votre lame'}
                        </span>
                      )}
                      <span className="cn-pad-label">
                        {game.phase === 'mixing'
                          ? 'FAITES DE PETITS CERCLES'
                          : mode === 'touch'
                            ? 'GLISSEZ POUR COUPER'
                            : 'INCLINEZ POUR VISER'}
                      </span>
                      <div className="cn-stir-meter" hidden={game.phase !== 'mixing'}>
                        <span ref={stirMeter} />
                      </div>
                    </div>
                  </>
                )}
                {!isActive && (
                  <div className="cn-hold-note">
                    <Check size={16} />
                    <p>
                      Tenez fermement votre téléphone.
                      <br />
                      De petits gestes, une grande recette.
                    </p>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
      {!(isActive && connection === 'connected') && (
        <footer className="cn-controller-footer">
          <Link2 size={12} /> LES MAINS EN ACTION. LES YEUX SUR LE PC.
        </footer>
      )}
      {connection === 'connected' && (
        <nav className="cn-command-dock" aria-label="Commandes du téléphone">
          <div className="cn-mode-switch" role="group" aria-label="Mode de contrôle">
            <button
              aria-pressed={controlChoice === 'motion'}
              onClick={() => {
                if (controlChoice !== 'motion' || mode === 'setup') void activateSensors();
              }}
            >
              <Smartphone size={18} /> Gyroscope
            </button>
            <button
              aria-pressed={controlChoice === 'touch'}
              onClick={() => {
                if (mode !== 'touch') useTouch();
              }}
            >
              <MousePointer2 size={18} /> Tactile
            </button>
          </div>
          <div className="cn-dock-actions">
            <button
              className={`cn-button ${running ? 'cn-button-light' : 'cn-button-primary'} cn-remote-action`}
              disabled={!actionEnabled}
              onClick={() => requestAction(remoteAction)}
            >
              {pendingAction || game.starting ? (
                <LoaderCircle size={20} className="cn-spin" />
              ) : running ? (
                <Pause size={20} />
              ) : (
                <Play size={20} fill="currentColor" />
              )}
              {actionLabel}
            </button>
            {mode === 'motion' && (
              <button
                className="cn-recenter-button"
                onClick={calibrate}
                aria-label="Recentrer la lame"
              >
                <Crosshair size={23} />
                <span>Recentrer</span>
              </button>
            )}
          </div>
          <p className="cn-dock-status" aria-live="polite">
            <span className={localReady ? 'is-ready' : ''} />
            {hidden
              ? 'Commandes suspendues'
              : localReady
                ? `${controlChoice === 'motion' ? 'Gyroscope' : 'Tactile'} prêt · Lame ${selectedBlade.name}`
                : mode === 'calibration'
                  ? 'Centrez le téléphone pour jouer'
                  : mode === 'listening'
                    ? 'Détection du mouvement…'
                    : 'Activez le gyroscope ou choisissez Tactile'}
          </p>
        </nav>
      )}
    </div>
  );
}
