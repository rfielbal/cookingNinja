import { useEffect, useRef, useState } from 'react';
import { Download, Pause, Play, ArrowLeft } from 'lucide-react';
import { FilmRenderer } from './showcase/FilmRenderer';
import { createSoundtrack } from './showcase/soundtrack';
import { FILM_FPS, FILM_SECONDS, FILM_SHOTS, filmShot } from './showcase/timeline';
import './showcase-film.css';

export default function ShowcaseFilm() {
  const mount = useRef<HTMLDivElement>(null);
  const renderer = useRef<FilmRenderer | null>(null);
  const position = useRef(0);
  const running = useRef(!matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [playing, setPlaying] = useState(running.current);
  const [seconds, setSeconds] = useState(0);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('');
  const [exporting, setExporting] = useState(false);
  const [download, setDownload] = useState<{ url: string; extension: string } | null>(null);
  const recording = useRef(false);
  const cleanupExport = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let scene: FilmRenderer | null = null;
    void Promise.all([
      document.fonts.ready,
      ...[400, 500, 600, 800].map((weight) => document.fonts.load(`${weight} 48px Outfit`)),
    ]).then(() => {
      if (cancelled) return;
      try {
        scene = new FilmRenderer();
        renderer.current = scene;
        mount.current?.appendChild(scene.canvas);
        setReady(true);
        let before = performance.now();
        let reported = 0;
        const draw = (now: number) => {
          const dt = Math.min(0.1, (now - before) / 1000);
          before = now;
          if (!recording.current && !document.hidden) {
            if (running.current) position.current = (position.current + dt) % FILM_SECONDS;
            try {
              scene?.render(position.current);
            } catch {
              setStatus('Le rendu 3D a été interrompu. Rechargez le studio pour réessayer.');
              setReady(false);
              setPlaying(false);
              return;
            }
          }
          if (now - reported > 150) {
            setSeconds(position.current);
            reported = now;
          }
          frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Le rendu 3D est indisponible.');
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      cleanupExport.current?.();
      scene?.canvas.remove();
      scene?.dispose();
      renderer.current = null;
    };
  }, []);

  useEffect(
    () => () => {
      if (download) URL.revokeObjectURL(download.url);
    },
    [download],
  );

  const seek = (at: number) => {
    if (recording.current) return;
    position.current = at;
    running.current = false;
    setPlaying(false);
    setSeconds(at);
    renderer.current?.render(at);
  };

  const exportFilm = async () => {
    if (!renderer.current || recording.current) return;
    const mime = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
    ].find((value) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(value));
    if (!mime || !renderer.current.canvas.captureStream) {
      setStatus('L’export demande un navigateur compatible avec MediaRecorder et captureStream.');
      return;
    }
    recording.current = true;
    setExporting(true);
    running.current = false;
    setPlaying(false);
    setStatus('Préparation de la bande-son…');
    let ctx: AudioContext | null = null;
    let stream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    let animation = 0;
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(animation);
      document.removeEventListener('visibilitychange', visibility);
      if (recorder?.state === 'recording') recorder.stop();
      stream?.getTracks().forEach((track) => track.stop());
      if (ctx && ctx.state !== 'closed') void ctx.close();
      recording.current = false;
      setExporting(false);
    };
    const visibility = () => {
      if (document.hidden) {
        setStatus('Export interrompu : gardez cet onglet visible pendant les 32 secondes.');
        cleanup();
      }
    };
    cleanupExport.current = cleanup;
    document.addEventListener('visibilitychange', visibility);
    try {
      ctx = new AudioContext();
      await ctx.resume();
      const soundtrack = await createSoundtrack();
      if (done) return;
      if (ctx.state !== 'running')
        throw new Error('Le navigateur n’a pas activé l’audio. Relancez l’export.');
      const output = ctx.createMediaStreamDestination();
      const source = ctx.createBufferSource();
      source.buffer = soundtrack;
      // Export to the file only; no accidental loud playback on the stand.
      source.connect(output);
      renderer.current.render(0);
      const video = renderer.current.canvas.captureStream(FILM_FPS);
      stream = new MediaStream([...video.getVideoTracks(), ...output.stream.getAudioTracks()]);
      recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 7_000_000,
        audioBitsPerSecond: 160_000,
      });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        setStatus('L’encodage a échoué. Réessayez dans Chrome.');
        cleanup();
      };
      recorder.onstop = () => {
        if (done) return;
        const blob = new Blob(chunks, { type: mime });
        setDownload({
          url: URL.createObjectURL(blob),
          extension: mime.startsWith('video/mp4') ? 'mp4' : 'webm',
        });
        setStatus(`Film prêt · ${(blob.size / 1_000_000).toFixed(1)} Mo`);
        cleanup();
      };
      recorder.start(1000);
      const start = ctx.currentTime;
      source.start(start);
      setStatus('Export en cours : gardez cet onglet visible.');
      const tick = () => {
        if (done || !ctx || !renderer.current) return;
        // Audio time is the common clock: rendering delays never lengthen the soundtrack.
        const elapsed = ctx.currentTime - start;
        position.current = Math.min(elapsed, FILM_SECONDS - 1 / FILM_FPS);
        try {
          renderer.current.render(position.current);
        } catch {
          setStatus('Export interrompu : le rendu 3D est indisponible. Rechargez le studio.');
          cleanup();
          return;
        }
        if (elapsed >= FILM_SECONDS) {
          recorder?.stop();
          return;
        }
        animation = requestAnimationFrame(tick);
      };
      animation = requestAnimationFrame(tick);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Export indisponible.');
      cleanup();
    }
  };

  return (
    <main className="film-studio">
      <header>
        <a href="/">
          <ArrowLeft size={18} /> Le jeu
        </a>
        <span>CookingNinja · Studio du film</span>
        <a href="/?stand=1">Voir le mode stand →</a>
      </header>
      <div
        className="film-preview"
        ref={mount}
        role="img"
        aria-label={`Film CookingNinja : ${filmShot(seconds).label}.`}
      />
      <section className="film-toolbar" aria-label="Montage de la présentation">
        <button
          disabled={!ready || exporting}
          onClick={() => {
            running.current = !running.current;
            setPlaying(running.current);
          }}
        >
          {playing ? <Pause size={20} /> : <Play size={20} />}
          {playing ? 'Pause' : 'Lire'}
        </button>
        <input
          type="range"
          min="0"
          max="31.99"
          step="0.01"
          value={seconds}
          aria-label="Position dans le film"
          disabled={exporting}
          onChange={(event) => seek(Number(event.target.value))}
        />
        <span>{Math.floor(seconds).toString().padStart(2, '0')} / 32 s</span>
        <button disabled={!ready || exporting} onClick={() => void exportFilm()}>
          <Download size={20} />
          {exporting ? 'Export…' : 'Exporter le film'}
        </button>
        {download && (
          <a href={download.url} download={`cookingninja-stand.${download.extension}`}>
            Télécharger le {download.extension.toUpperCase()}
          </a>
        )}
      </section>
      <nav className="film-chapters" aria-label="Plans du film">
        {FILM_SHOTS.map((shot, i) => (
          <button
            key={shot.at}
            disabled={exporting}
            aria-pressed={filmShot(seconds).index === i}
            onClick={() => seek(shot.at + 1.5)}
          >
            {String(i + 1).padStart(2, '0')} · {shot.label}
          </button>
        ))}
      </nav>
      <p role="status">
        {status ||
          '32 secondes · 1920 × 1080 · bande-son originale intégrée à l’export. Le mode stand lit le fichier déjà exporté.'}
      </p>
    </main>
  );
}
