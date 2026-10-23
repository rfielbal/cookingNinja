import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, RefreshCw, Smartphone, WifiOff } from 'lucide-react';
import {
  configuredControllerOrigin,
  controllerAddress,
  hostConnectionReport,
} from '../connectionDiagnostic';
import { ConnectionDiagnostic } from './ConnectionDiagnostic';

type ConfigState = {
  code: string;
  origin: string;
  state: 'loading' | 'ready' | 'error';
  error: string;
};
export function PairDialog({
  code,
  connected,
  online,
  ready,
  source,
  error,
  onClose,
}: {
  code: string;
  connected: boolean;
  online: boolean;
  ready?: boolean;
  source?: 'motion' | 'touch';
  error?: string;
  onClose?: () => void;
}) {
  const [config, setConfig] = useState<ConfigState>({
    code: '',
    origin: '',
    state: 'loading',
    error: '',
  });
  const [manualAddress, setManualAddress] = useState<{ code: string; origin: string } | null>(null);
  const [revision, setRevision] = useState(0);
  const [qr, setQr] = useState({ url: '', image: '', error: '' });
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const roomAvailable = online && /^[A-HJ-NP-Z2-9]{6}$/.test(code);
  const manualOrigin = roomAvailable && manualAddress?.code === code ? manualAddress.origin : null;
  const currentConfig = config.code === code && roomAvailable;
  const origin = manualOrigin ?? (currentConfig ? config.origin : '');
  const address = controllerAddress(origin);
  const url = roomAvailable && address.usable ? `${address.origin}/controller?room=${code}` : '';
  const paired = roomAvailable && connected;
  const report = hostConnectionReport({ code, online, connected, ready, source, error });
  const configError = currentConfig && config.state === 'error' ? config.error : '';
  const qrError = qr.url === url ? qr.error : '';

  useEffect(() => {
    if (!roomAvailable) {
      setManualAddress(null);
      return;
    }
    setManualAddress((current) => (current?.code === code ? current : null));
    let alive = true;
    const abort = new AbortController();
    const timeout = window.setTimeout(() => abort.abort(), 5000);
    setConfig({ code, origin: '', state: 'loading', error: '' });
    void fetch('/api/config', { cache: 'no-store', signal: abort.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Le serveur refuse la configuration (HTTP ${response.status}).`);
        return configuredControllerOrigin(await response.json(), location.origin);
      })
      .then((nextOrigin) => {
        if (alive) setConfig({ code, origin: nextOrigin, state: 'ready', error: '' });
      })
      .catch((reason: unknown) => {
        if (!alive) return;
        const message = abort.signal.aborted
          ? 'Le serveur ne répond pas à la demande d’adresse. Réessayez.'
          : reason instanceof SyntaxError
            ? 'La configuration reçue est illisible. Réessayez.'
            : reason instanceof Error
              ? reason.message
              : 'Impossible de récupérer l’adresse du téléphone.';
        setConfig({ code, origin: '', state: 'error', error: message });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      alive = false;
      abort.abort();
      window.clearTimeout(timeout);
    };
  }, [roomAvailable, code, revision]);

  useEffect(() => {
    let alive = true;
    setQr({ url, image: '', error: '' });
    setCopied(false);
    setCopyError('');
    if (url)
      void QRCode.toDataURL(url, {
        width: 240,
        margin: 2,
        color: { dark: '#234c35', light: '#ffffff' },
      })
        .then((image) => {
          if (alive) setQr({ url, image, error: '' });
        })
        .catch(() => {
          if (alive)
            setQr({
              url,
              image: '',
              error:
                'Le QR code n’a pas pu être créé. Copiez le lien dans les détails ou actualisez.',
            });
        });
    return () => {
      alive = false;
    };
  }, [url, revision]);

  const refresh = () => {
    setManualAddress(null);
    setConfig({ code: '', origin: '', state: 'loading', error: '' });
    setRevision((value) => value + 1);
  };
  let title = report.title,
    detail = report.detail;
  let blocked = report.state === 'blocked';
  if (roomAvailable && !paired) {
    if (manualOrigin === null && (!currentConfig || config.state === 'loading')) {
      title = 'Préparation du lien';
      detail = 'Le PC récupère l’adresse actuelle du téléphone.';
    } else if (configError && manualOrigin === null) {
      title = 'Adresse à récupérer';
      detail = configError;
      blocked = true;
    } else if (!address.usable) {
      title = 'Adresse du téléphone à vérifier';
      detail = address.loopback
        ? 'Une adresse localhost ne fonctionne pas depuis un autre appareil. Actualisez le lien ou renseignez l’adresse réseau du PC dans les détails.'
        : 'Aucune adresse utilisable. Demandez à l’exposant le lien HTTPS ou l’adresse réseau du PC.';
      blocked = true;
    } else if (qrError) {
      title = 'QR indisponible';
      detail = qrError;
      blocked = true;
    } else if (!address.secure)
      detail =
        'Même Wi-Fi que le PC, puis choisissez Tactile. Pour le gyroscope, demandez le QR HTTPS à l’exposant.';
  }
  const diagnostic = {
    ...report,
    title,
    detail,
    state: blocked ? ('blocked' as const) : report.state,
    checks: [
      ...report.checks,
      {
        label: 'Lien téléphone',
        state: address.usable && online ? ('unused' as const) : ('waiting' as const),
        detail: !online
          ? 'Masqué pendant la coupure.'
          : !address.usable
            ? 'Aucune adresse distante utilisable.'
            : address.secure
              ? 'Adresse HTTPS proposée. Le contexte sécurisé et les capteurs se vérifient sur le téléphone.'
              : 'Adresse HTTP locale : même Wi-Fi et mode tactile.',
      },
    ],
  };

  return (
    <div className="pair-content">
      <span className="modal-symbol">
        <Smartphone size={30} />
      </span>
      <p className="eyebrow">VOTRE TÉLÉPHONE, VOTRE SABRE</p>
      <h2>À vous de jouer</h2>
      <p className={`pair-status-message ${blocked ? 'is-blocked' : ''}`} role="status">
        <strong>{title}</strong>
        {detail}
      </p>
      <div className={`qr-box ${paired ? 'paired' : ''}`}>
        {paired ? (
          <>
            <Check size={55} />
            <strong>{ready ? 'Commandes reçues' : 'Téléphone associé'}</strong>
          </>
        ) : !roomAvailable ? (
          <span className="pair-qr-state">
            <WifiOff size={32} />
            {online ? 'Nouveau code en préparation…' : 'QR masqué : serveur déconnecté'}
          </span>
        ) : url && qr.url === url && qr.image ? (
          <img
            src={qr.image}
            alt={`QR code de connexion au salon ${code}`}
            width="210"
            height="210"
          />
        ) : (
          <span className="pair-qr-state">
            {blocked ? 'Vérifiez le lien ci-dessous' : 'Préparation du QR code…'}
          </span>
        )}
      </div>
      <div className="room-code">
        <span>CODE DU SALON</span>
        <strong>{roomAvailable ? code : '••••••'}</strong>
        <i className={paired ? 'connected-dot' : ''} />
      </div>
      <ConnectionDiagnostic report={diagnostic}>
        <p>
          Internet, le certificat d’une adresse distante et le délai de commande ne sont pas mesurés
          ici.
        </p>
        <details className="pair-address-details">
          <summary>Modifier ou copier l’adresse</summary>
          <label className="address-label">
            Adresse du serveur
            <input
              type="url"
              value={origin}
              onChange={(event) => setManualAddress({ code, origin: event.target.value })}
              placeholder="https://votre-serveur.fr"
            />
          </label>
          {origin && !address.usable && (
            <small className="pair-link-error">
              {address.loopback
                ? 'Utilisez une adresse accessible depuis le téléphone, pas localhost.'
                : 'Entrez une adresse HTTP ou HTTPS sans identifiant ni mot de passe.'}
            </small>
          )}
          {configError && <small className="pair-link-error">{configError}</small>}
          {copyError && (
            <small className="pair-link-error" role="status">
              {copyError}
            </small>
          )}
          <button
            className="text-button"
            disabled={!url}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
              } catch {
                setCopyError('Copie indisponible. Sélectionnez le lien ci-dessous.');
              }
            }}
          >
            <Copy size={15} />
            {copied ? 'Lien copié' : 'Copier le lien'}
          </button>
          {url && (
            <a className="controller-link" href={url} target="_blank" rel="noreferrer">
              {url}
            </a>
          )}
        </details>
      </ConnectionDiagnostic>
      <div className="pair-diagnostic-actions">
        <button className="text-button" disabled={!roomAvailable} onClick={refresh}>
          <RefreshCw size={15} />
          Actualiser le lien
        </button>
        {onClose && (
          <button className="button primary" onClick={onClose}>
            {paired && ready ? 'C’est prêt' : 'Fermer'}
          </button>
        )}
      </div>
    </div>
  );
}
