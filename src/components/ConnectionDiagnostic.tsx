import { useEffect, useState, type ReactNode } from 'react';
import { Check, ChevronDown, CircleHelp, Minus, TriangleAlert } from 'lucide-react';
import {
  phoneConnectionReport,
  type CheckState,
  type ConnectionReport,
} from '../connectionDiagnostic';
import './connection-diagnostic.css';

function StateIcon({ state }: { state: CheckState }) {
  return state === 'ok' ? (
    <Check size={15} />
  ) : state === 'blocked' ? (
    <TriangleAlert size={15} />
  ) : state === 'unused' ? (
    <Minus size={15} />
  ) : (
    <CircleHelp size={15} />
  );
}

export function ConnectionDiagnostic({
  report,
  children,
  onAction,
  compact = false,
}: {
  report: ConnectionReport;
  children?: ReactNode;
  onAction?: (action: NonNullable<ConnectionReport['action']>) => void;
  compact?: boolean;
}) {
  return (
    <details className={`connection-diagnostic ${compact ? 'is-compact' : ''}`}>
      <summary>
        <span>
          <CircleHelp size={15} /> Diagnostic de connexion
        </span>
        <span className={`connection-check-state is-${report.state}`}>
          {report.state === 'ok' ? 'Prêt' : report.state === 'blocked' ? 'À vérifier' : 'En cours'}
          <ChevronDown size={14} />
        </span>
      </summary>
      <div className="connection-diagnostic-body">
        <strong>{report.title}</strong>
        <p>{report.detail}</p>
        <ul>
          {report.checks.map((check) => (
            <li key={check.label} className={`is-${check.state}`}>
              <span className="connection-check-icon">
                <StateIcon state={check.state} />
              </span>
              <div>
                <b>{check.label}</b>
                <span>{check.detail}</span>
              </div>
            </li>
          ))}
        </ul>
        {report.action && onAction && (
          <button
            type="button"
            className="connection-diagnostic-action"
            onClick={() => onAction(report.action!)}
          >
            {
              {
                retry: 'Réessayer la connexion',
                sensors: 'Réactiver les capteurs',
                calibrate: 'Centrer ma lame',
                touch: 'Utiliser le tactile',
              }[report.action]
            }
          </button>
        )}
        {children}
      </div>
    </details>
  );
}

type PhoneProps = Omit<Parameters<typeof phoneConnectionReport>[0], 'fresh'> & {
  readFresh: () => boolean;
  onAction: (action: NonNullable<ConnectionReport['action']>) => void;
  compact: boolean;
};

/** Only this small panel observes freshness; no React updates in the input loop. */
export function PhoneConnectionDiagnostic({ readFresh, onAction, compact, ...input }: PhoneProps) {
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    const update = () => setFresh(!document.hidden && readFresh());
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [readFresh, input.mode, input.hidden]);
  return (
    <ConnectionDiagnostic
      report={phoneConnectionReport({ ...input, fresh })}
      compact={compact}
      onAction={onAction}
    />
  );
}
