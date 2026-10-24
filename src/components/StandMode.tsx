import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ChefHat,
  Download,
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import '../stand-mode.css';

const FILM_URL = '/media/cookingninja-stand.mp4';

export function StandMode({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(false);
  const playAttempt = useRef(0);
  const keyboardActive = useRef(false);
  const wantPlaying = useRef(true);
  const ownsFullscreen = useRef(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [ready, setReady] = useState(false);
  const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const reveal = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (controls.current?.contains(document.activeElement)) {
        if (keyboardActive.current) return;
        dialog.current?.focus({ preventScroll: true });
      }
      setControlsVisible(false);
    }, 3000);
  }, []);

  const play = useCallback(() => {
    const element = video.current;
    if (!element || document.hidden) return;
    const attempt = ++playAttempt.current;
    void element.play().catch((cause: unknown) => {
      if (
        !mounted.current ||
        attempt !== playAttempt.current ||
        (cause instanceof DOMException && cause.name === 'AbortError')
      )
        return;
      setNotice('Appuyez sur Lecture pour lancer le film.');
      reveal();
    });
  }, [reveal]);

  useEffect(() => {
    const element = dialog.current!;
    const film = video.current!;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    mounted.current = true;
    setReady(film.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
    element.showModal();
    element.focus({ preventScroll: true });
    document.body.style.overflow = 'hidden';
    reveal();
    play();
    const visibility = () => {
      if (document.hidden) film.pause();
      else if (wantPlaying.current) play();
    };
    const changedFullscreen = () => {
      setFullscreen(!!document.fullscreenElement);
      if (!document.fullscreenElement) ownsFullscreen.current = false;
      if (document.fullscreenElement === document.documentElement && element.open) {
        // The newly fullscreen root enters the top layer after the modal. Restore
        // the modal above it, otherwise Chromium displays the covered game.
        const focused =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        element.close();
        element.showModal();
        if (focused && element.contains(focused)) focused.focus({ preventScroll: true });
        else element.focus({ preventScroll: true });
      }
      reveal();
    };
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('fullscreenchange', changedFullscreen);
    return () => {
      mounted.current = false;
      playAttempt.current++;
      clearTimeout(hideTimer.current);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('fullscreenchange', changedFullscreen);
      film.pause();
      if (ownsFullscreen.current && document.fullscreenElement === document.documentElement) {
        void document.exitFullscreen().catch(() => {});
      }
      element.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [play, reveal]);

  const togglePlayback = () => {
    const element = video.current;
    if (!element) return;
    reveal();
    setNotice('');
    if (error) {
      setError('');
      setReady(false);
      element.load();
    } else if (!element.paused) {
      wantPlaying.current = false;
      element.pause();
      return;
    }
    wantPlaying.current = true;
    play();
  };
  const toggleSound = () => {
    const element = video.current;
    if (!element) return;
    element.muted = !element.muted;
    setMuted(element.muted);
    reveal();
    if (wantPlaying.current) play();
  };
  const toggleFullscreen = () => {
    reveal();
    setNotice('');
    const entering = !document.fullscreenElement;
    const operation = document.fullscreenElement
      ? document.exitFullscreen?.()
      : document.documentElement.requestFullscreen?.();
    if (!operation) {
      setNotice('Le plein écran n’est pas disponible dans ce navigateur.');
      return;
    }
    void operation
      .then(() => {
        if (entering) {
          ownsFullscreen.current = true;
          if (!mounted.current && document.fullscreenElement === document.documentElement)
            void document.exitFullscreen().catch(() => {});
        }
      })
      .catch(() => {
        if (mounted.current) setNotice('Le navigateur n’a pas autorisé le plein écran.');
      });
  };

  return (
    <dialog
      className={`stand-mode ${controlsVisible || !playing || error || notice ? 'has-controls' : ''}`}
      ref={dialog}
      aria-modal="true"
      aria-label="CookingNinja, présentation du stand"
      tabIndex={-1}
      data-audio-control
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerMove={reveal}
      onPointerDown={() => {
        keyboardActive.current = false;
        reveal();
      }}
      onKeyDown={(event) => {
        keyboardActive.current = true;
        reveal();
        if (
          event.key === 'Enter' &&
          !event.repeat &&
          !(
            event.target instanceof Element &&
            event.target.closest('button,a,input,select,textarea')
          )
        ) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="stand-mode-screen">
        <video
          ref={video}
          className="stand-mode-film"
          src={FILM_URL}
          poster="/media/cookingninja-stand.webp"
          autoPlay
          loop
          playsInline
          muted={muted}
          preload="auto"
          aria-label="CookingNinja, le téléphone devient votre lame"
          onLoadedData={() => {
            setReady(true);
            setError('');
          }}
          onCanPlay={() => {
            setReady(true);
            setError('');
          }}
          onPlay={() => {
            setPlaying(true);
            if (video.current && video.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
              setReady(true);
            setNotice('');
          }}
          onPause={() => setPlaying(false)}
          onVolumeChange={() => setMuted(video.current?.muted ?? true)}
          onError={() => {
            setReady(false);
            setPlaying(false);
            setNotice('');
            setError('Le film ne peut pas être chargé. Réessayez ou revenez au jeu.');
          }}
        />
        {(!ready || error) && (
          <div className={`stand-mode-placeholder ${error ? '' : 'is-loading'}`} role="status">
            {error && <ChefHat size={42} strokeWidth={1.5} />}
            {error && <strong>CookingNinja</strong>}
            <span>{error || 'Le film se prépare…'}</span>
          </div>
        )}
      </div>
      <div
        className="stand-mode-chrome"
        ref={controls}
        onFocusCapture={reveal}
        onBlurCapture={reveal}
      >
        <header className="stand-mode-heading">
          <div className="stand-mode-brand">
            <ChefHat size={26} />
            <span>
              cooking<b>ninja</b>
              <small>LYCÉE GUY MOLLET · ARRAS</small>
            </span>
          </div>
          <button className="stand-mode-icon" aria-label="Fermer le mode stand" onClick={onClose}>
            <X size={22} />
          </button>
        </header>
        <footer className="stand-mode-bar">
          <div className="stand-mode-tools">
            <button
              className="stand-mode-icon"
              onClick={togglePlayback}
              aria-label={
                error ? 'Réessayer le film' : playing ? 'Mettre le film en pause' : 'Lire le film'
              }
            >
              {playing ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button
              className="stand-mode-icon"
              onClick={toggleSound}
              aria-label={muted ? 'Activer le son du film' : 'Couper le son du film'}
              aria-pressed={!muted}
            >
              {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <button
              className="stand-mode-icon"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? 'Quitter le plein écran' : 'Afficher le film en plein écran'}
            >
              {fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
            <a className="stand-mode-download" href={FILM_URL} download="CookingNinja-stand.mp4">
              <Download size={18} />
              <span>Télécharger le film</span>
            </a>
          </div>
          <div className="stand-mode-actions">
            <a href="/atelier#atelier-decouverte" target="_blank" rel="noopener noreferrer">
              Les coulisses <ArrowUpRight size={17} />
            </a>
            <button className="stand-mode-play" onClick={onClose}>
              <Play size={18} fill="currentColor" /> Jouer <kbd>↵</kbd>
            </button>
          </div>
        </footer>
        {notice && (
          <p className="stand-mode-notice" role="status">
            {notice}
          </p>
        )}
      </div>
    </dialog>
  );
}
