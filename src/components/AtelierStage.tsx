import { useEffect, useRef, useState } from 'react';
import { AtelierScene, type AtelierFrame, type AtelierSceneState } from '../game/AtelierScene';

export interface AtelierStageProps extends AtelierSceneState {
  onFrame?: (state: AtelierFrame) => void;
}

/** Isolated visual demo; callbacks are deliberately capped below ten updates per second. */
export function AtelierStage({
  step,
  paused,
  reducedMotion,
  action,
  variant,
  codeStep,
  onFrame,
}: AtelierStageProps) {
  const container = useRef<HTMLDivElement>(null);
  const current = useRef<AtelierSceneState>({
    step,
    paused,
    reducedMotion,
    action,
    variant,
    codeStep,
  });
  const callback = useRef(onFrame);
  current.current = { step, paused, reducedMotion, action, variant, codeStep };
  callback.current = onFrame;
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let scene: AtelierScene;
    try {
      scene = new AtelierScene(element, current.current);
    } catch {
      setUnavailable(true);
      return;
    }
    let stopped = false;
    let lostContext = false;
    let hidden = document.hidden;
    let frame = 0;
    let last = performance.now();
    let notified = -Infinity;
    let dirty = true;
    let notificationPending = true;
    let renderedConfig = current.current;
    const resize = () => {
      if (stopped || lostContext) return;
      const bounds = element.getBoundingClientRect();
      scene.resize(bounds.width, bounds.height);
      dirty = true;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const onVisibility = () => {
      hidden = document.hidden;
      last = performance.now();
      dirty = true;
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      lostContext = true;
      scene.canvas.style.visibility = 'hidden';
      setUnavailable(true);
      cancelAnimationFrame(frame);
    };
    document.addEventListener('visibilitychange', onVisibility);
    scene.canvas.addEventListener('webglcontextlost', onContextLost);
    const loop = (now: number) => {
      if (stopped || lostContext) return;
      const config = current.current;
      if (config !== renderedConfig) {
        scene.configure(config);
        renderedConfig = config;
        dirty = true;
      }
      const dt = Math.min(0.06, Math.max(0, (now - last) / 1000));
      last = now;
      if (!hidden && (dirty || scene.animating)) {
        scene.render(dt);
        dirty = false;
        notificationPending = true;
      }
      if (!hidden && notificationPending && now - notified >= 125) {
        callback.current?.(scene.frame());
        notified = now;
        notificationPending = false;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      scene.canvas.removeEventListener('webglcontextlost', onContextLost);
      scene.dispose();
    };
  }, []);

  return (
    <div
      className="atelier-stage-canvas"
      ref={container}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      {unavailable && (
        <p
          className="atelier-stage-fallback"
          role="status"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center',
            padding: 24,
          }}
        >
          L’aperçu 3D est indisponible sur ce navigateur. Les étapes et leurs explications restent
          accessibles.
        </p>
      )}
    </div>
  );
}
