import { Check, Sparkles } from 'lucide-react';
import type { CSSProperties } from 'react';
import { BLADES, type BladeId } from '../../shared/blades';

export function BladePicker({
  value,
  onChange,
  compact = false,
}: {
  value: BladeId;
  onChange: (value: BladeId) => void;
  compact?: boolean;
}) {
  return (
    <fieldset className={`blade-picker ${compact ? 'blade-picker-compact' : ''}`}>
      <legend>
        <Sparkles size={14} /> Votre lame
      </legend>
      <div className="blade-options">
        {BLADES.map((blade) => (
          <button
            key={blade.id}
            type="button"
            aria-pressed={value === blade.id}
            onClick={() => onChange(blade.id)}
            title={blade.description}
            style={{ '--swatch': blade.color } as CSSProperties}
          >
            <i aria-hidden="true" />
            <span>{blade.name}</span>
            {value === blade.id && <Check size={13} />}
          </button>
        ))}
      </div>
      {!compact && (
        <small>
          La couleur du sillage et du viseur. Retrouvez aussi ce choix sur votre téléphone.
        </small>
      )}
    </fieldset>
  );
}
