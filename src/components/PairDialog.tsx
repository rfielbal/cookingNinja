import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Smartphone, Wifi } from 'lucide-react';
export function PairDialog({
  code,
  connected,
  online,
}: {
  code: string;
  connected: boolean;
  online: boolean;
}) {
  const [origin, setOrigin] = useState(location.origin);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [configError, setConfigError] = useState('');
  useEffect(() => {
    let alive = true;
    fetch('/api/config')
      .then((r) => r.json())
      .then((config) => {
        if (alive)
          setOrigin(
            config.controllerOrigin ||
              (location.hostname === 'localhost' || location.hostname === '127.0.0.1'
                ? config.localUrls?.[0]
                : location.origin) ||
              location.origin,
          );
      })
      .catch(() => {
        if (alive)
          setConfigError('Adresse réseau indisponible. Renseignez celle de votre serveur.');
      });
    return () => {
      alive = false;
    };
  }, []);
  let url = '',
    valid = false,
    secure = false;
  try {
    const parsed = new URL(origin);
    valid = ['http:', 'https:'].includes(parsed.protocol);
    secure = parsed.protocol === 'https:';
    if (valid) url = `${parsed.origin}/controller?room=${code}`;
  } catch {
    /* Editable address. */
  }
  useEffect(() => {
    let alive = true;
    setQr('');
    if (valid && code)
      void QRCode.toDataURL(url, {
        width: 240,
        margin: 2,
        color: { dark: '#234c35', light: '#ffffff' },
      }).then((data) => {
        if (alive) setQr(data);
      });
    return () => {
      alive = false;
    };
  }, [url, valid, code]);
  return (
    <div className="pair-content">
      <span className="modal-symbol">
        <Smartphone size={30} />
      </span>
      <p className="eyebrow">VOTRE TÉLÉPHONE, VOTRE SABRE</p>
      <h2>Prêt à faire le geste ?</h2>
      <p>
        {secure
          ? 'Scannez le QR code avec votre téléphone.'
          : 'Connexion locale : ce QR code permet le pavé tactile uniquement.'}
        <br />
        {secure
          ? 'Aucune application à installer.'
          : 'Le gyroscope nécessite le lien HTTPS du mode téléphone.'}
      </p>
      <div className={`qr-box ${connected ? 'paired' : ''}`}>
        {connected ? (
          <>
            <Check size={64} />
            <strong>Téléphone connecté !</strong>
          </>
        ) : qr ? (
          <img src={qr} alt={`QR code de connexion au salon ${code}`} width="210" height="210" />
        ) : (
          <span>{online ? 'Création du QR code…' : 'Connexion au serveur…'}</span>
        )}
      </div>
      <div className="room-code">
        <span>CODE DU SALON</span>
        <strong>{code || '••••••'}</strong>
        <i className={connected ? 'connected-dot' : ''} />
      </div>
      <ol className="pair-steps">
        <li>Entrez en cuisine, puis activez le gyroscope.</li>
        <li>Tenez le téléphone devant vous et recentrez.</li>
        <li>Choisissez votre recette sur l’ordinateur.</li>
      </ol>
      {!secure && (
        <div className="network-note">
          <Wifi size={18} />
          <span>
            Pour jouer avec les mouvements, demandez le QR HTTPS à l’exposant. Avec ce lien local,
            connectez le téléphone au même Wi-Fi que le PC et utilisez le pavé tactile.
          </span>
        </div>
      )}
      <details>
        <summary>Adresse de connexion</summary>
        <label className="address-label">
          Adresse du serveur
          <input
            type="url"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="https://votre-serveur.fr"
          />
        </label>
        {!valid && <small role="alert">Entrez une adresse HTTP ou HTTPS complète.</small>}
        {configError && <small>{configError}</small>}
        <button
          className="text-button"
          disabled={!valid || !code}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              setConfigError('Copie indisponible. Sélectionnez l’adresse ci-dessous.');
            }
          }}
        >
          <Copy size={15} />
          {copied ? 'Lien copié' : 'Copier le lien'}
        </button>
        <a className="controller-link" href={url || undefined} target="_blank" rel="noreferrer">
          {url}
        </a>
      </details>
    </div>
  );
}
