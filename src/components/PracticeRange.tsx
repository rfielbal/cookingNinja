import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { ArrowRight, Check, RotateCcw } from 'lucide-react';
import type { MotionInput } from '../net';

const targets = [
  { x: 0.3, y: 0.49 },
  { x: 0.7, y: 0.45 },
  { x: 0.5, y: 0.62 },
];
/** Same normalized coordinates as the real arena; this exercise never changes the score. */
export function PracticeRange({
  inputRef,
  ready,
  source,
  busy,
  onBegin,
  onClose,
}: {
  inputRef: MutableRefObject<((input: MotionInput) => void) | null>;
  ready: boolean;
  source: 'motion' | 'touch';
  busy: boolean;
  onBegin: () => void;
  onClose: () => void;
}) {
  const [cursor, setCursor] = useState({ x: 0.5, y: 0.5, slash: false });
  const [completed, setCompleted] = useState(0);
  const progress = useRef(0);
  const previous = useRef<{ x: number; y: number; at: number } | null>(null);
  useEffect(() => {
    inputRef.current = (packet) => {
      setCursor(packet);
      const a =
          packet.source === 'touch' && packet.fromX !== undefined && packet.fromY !== undefined
            ? { x: packet.fromX, y: packet.fromY, at: performance.now() }
            : previous.current,
        b = packet,
        target = targets[progress.current];
      if (a && target && packet.slash && performance.now() - a.at < 250) {
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const length = dx * dx + dy * dy;
        const t = length
          ? Math.max(0, Math.min(1, ((target.x - a.x) * dx + (target.y - a.y) * dy) / length))
          : 0;
        if (
          length > 0.000002 &&
          Math.hypot(a.x + dx * t - target.x, a.y + dy * t - target.y) < 0.07
        ) {
          progress.current++;
          setCompleted(progress.current);
        }
      }
      previous.current = { ...packet, at: performance.now() };
    };
    return () => {
      inputRef.current = null;
    };
  }, [inputRef]);
  return (
    <div className="practice-range">
      <div className="practice-title">
        <p className="eyebrow">ESSAI LIBRE · AUCUN CŒUR EN JEU</p>
        <h2>{completed === 3 ? 'Vous avez le geste !' : 'Coupez les 3 cibles.'}</h2>
        <p>
          {!ready
            ? 'Les commandes sont interrompues. Regardez votre téléphone.'
            : source === 'touch'
              ? 'Glissez sur le pavé du téléphone pour traverser les cibles.'
              : 'Inclinez doucement pour viser, puis donnez un petit coup de poignet.'}
        </p>
      </div>
      {targets.map((t, i) => (
        <div
          key={i}
          className={`practice-target ${i < completed ? 'done' : i === completed ? 'current' : ''}`}
          style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%` }}
        >
          {i < completed ? <Check /> : i + 1}
        </div>
      ))}
      {ready && (
        <i
          className={`practice-cursor ${cursor.slash ? 'cutting' : ''}`}
          style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }}
        />
      )}
      <div className="practice-actions">
        <span>{completed} / 3 gestes réussis</span>
        <button className="button primary" disabled={!ready || busy} onClick={onBegin}>
          {busy ? 'Préparation…' : completed === 3 ? 'C’est parti !' : 'Jouer sans finir l’essai'}
          <ArrowRight size={18} />
        </button>
        <button className="text-button" onClick={onClose}>
          <RotateCcw size={16} /> Retour à la préparation
        </button>
      </div>
    </div>
  );
}
