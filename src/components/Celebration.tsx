import { useEffect, useState, type CSSProperties } from 'react';

/** A finite count-up, cancelled on unmount and skipped for reduced motion. */
export function ScoreCounter({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(value);
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const stop = () => {
      cancelAnimationFrame(frame);
      setDisplayed(value);
    };
    if (preference.matches) {
      stop();
      return;
    }
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 1100);
      setDisplayed(Math.round(value * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    setDisplayed(0);
    frame = requestAnimationFrame(tick);
    preference.addEventListener('change', stop);
    return () => {
      cancelAnimationFrame(frame);
      preference.removeEventListener('change', stop);
    };
  }, [value]);
  return <>{displayed.toLocaleString('fr')}</>;
}

export function Celebration({ won, lowQuality }: { won: boolean; lowQuality: boolean }) {
  return (
    <div className={`result-celebration ${won ? 'celebrate-win' : ''}`} aria-hidden="true">
      <span className="result-halo" />
      {won &&
        Array.from({ length: lowQuality ? 10 : 28 }, (_, index) => (
          <i
            key={index}
            style={
              {
                '--x': `${(index * 37 + 3) % 100}%`,
                '--delay': `${(index % 7) * 0.13}s`,
                '--drift': `${(index % 2 ? 1 : -1) * (35 + index * 3)}px`,
                '--turn': `${index % 2 ? 420 : -480}deg`,
                '--confetti': ['#ffb45f', '#fff3cc', '#8bd9b5'][index % 3],
              } as CSSProperties
            }
          />
        ))}
    </div>
  );
}
