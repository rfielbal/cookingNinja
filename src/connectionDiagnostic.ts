export type CheckState = 'ok' | 'waiting' | 'blocked' | 'unused';
export type ConnectionCheck = { label: string; state: CheckState; detail: string };
export type ConnectionReport = {
  title: string;
  detail: string;
  state: CheckState;
  checks: ConnectionCheck[];
  action?: 'retry' | 'sensors' | 'calibrate' | 'touch';
};

export function controllerAddress(value: string) {
  try {
    const parsed = new URL(value.trim());
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    const valid =
      ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
    const loopback =
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host === '[::1]' ||
      host === '[::]' ||
      host === '0.0.0.0' ||
      /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(host) ||
      /^127\./.test(host);
    return {
      valid,
      usable: valid && !loopback,
      loopback,
      secure: parsed.protocol === 'https:',
      origin: valid ? parsed.origin : '',
    };
  } catch {
    return { valid: false, usable: false, loopback: false, secure: false, origin: '' };
  }
}

/** Only address selection: this does not test reachability or a remote certificate. */
export function configuredControllerOrigin(value: unknown, pageOrigin: string): string {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Configuration de connexion illisible.');
  const config = value as Record<string, unknown>;
  if (
    !Array.isArray(config.localUrls) ||
    !config.localUrls.every((url) => typeof url === 'string') ||
    typeof config.secure !== 'boolean' ||
    (config.controllerOrigin !== undefined && typeof config.controllerOrigin !== 'string')
  )
    throw new Error('Configuration de connexion incomplète.');
  if (typeof config.controllerOrigin === 'string' && config.controllerOrigin.trim()) {
    const address = controllerAddress(config.controllerOrigin);
    if (!address.usable)
      throw new Error('L’adresse téléphone fournie par le serveur est inutilisable.');
    return address.origin;
  }
  return (
    [pageOrigin, ...config.localUrls].map(controllerAddress).find((address) => address.usable)
      ?.origin ?? ''
  );
}

export function hostConnectionReport(input: {
  online: boolean;
  code: string;
  connected: boolean;
  ready?: boolean;
  source?: 'motion' | 'touch';
  error?: string;
}): ConnectionReport {
  const room = input.online && /^[A-HJ-NP-Z2-9]{6}$/.test(input.code);
  const paired = room && input.connected;
  const receiving = paired && input.ready === true;
  const checks: ConnectionCheck[] = [
    {
      label: 'Serveur',
      state: input.online ? 'ok' : 'blocked',
      detail: input.online
        ? 'Connexion du PC au relais ouverte.'
        : 'Connexion du PC au relais interrompue.',
    },
    {
      label: 'Téléphone',
      state: paired ? 'ok' : 'waiting',
      detail: paired
        ? 'Association confirmée par le serveur.'
        : room
          ? 'Scannez le QR puis entrez en cuisine.'
          : 'En attente d’un nouveau code de salon.',
    },
    {
      label: 'Commandes',
      state: receiving ? 'ok' : 'waiting',
      detail: receiving
        ? `${input.source === 'touch' ? 'Tactile' : input.source === 'motion' ? 'Mouvement' : 'Commandes'} reçu récemment sur le PC.`
        : paired
          ? 'Aucune commande récente. Vérifiez l’écran du téléphone.'
          : 'Vérifiées après l’association.',
    },
  ];
  if (!input.online)
    return {
      title: 'Le PC attend le serveur',
      detail:
        input.error ||
        'Laissez le jeu ouvert pendant la reconnexion. Si elle échoue, demandez à l’exposant de relancer le serveur.',
      state: 'blocked',
      checks,
    };
  if (!room)
    return {
      title: input.error ? 'Salon indisponible' : 'Création du code de salon',
      detail: input.error
        ? `${input.error} Demandez à l’exposant de relancer la connexion.`
        : 'Attendez le nouveau code avant de scanner.',
      state: input.error ? 'blocked' : 'waiting',
      checks,
    };
  if (!paired)
    return {
      title: 'Reliez votre téléphone',
      detail: 'Scannez le QR puis touchez « Entrer en cuisine ».',
      state: 'waiting',
      checks,
    };
  if (!receiving)
    return {
      title: 'Terminez sur le téléphone',
      detail:
        'Activez et centrez le gyroscope, ou choisissez Tactile. Gardez cet onglet au premier plan.',
      state: 'waiting',
      checks,
    };
  return {
    title: 'Téléphone prêt',
    detail: 'Le PC reçoit vos commandes. Vous pouvez revenir à la recette.',
    state: 'ok',
    checks,
  };
}

export function phoneConnectionReport(input: {
  relayOpen: boolean;
  associated: boolean;
  connectionError: string;
  secureContext: boolean;
  https: boolean;
  hidden: boolean;
  mode: 'setup' | 'listening' | 'calibration' | 'motion' | 'touch';
  fresh: boolean;
  hasOrientation: boolean;
  sensorError: string;
  calibrating: boolean;
}): ConnectionReport {
  const touch = input.mode === 'touch';
  const paired = input.relayOpen && input.associated;
  const fresh =
    !input.hidden &&
    input.fresh &&
    input.hasOrientation &&
    ['calibration', 'motion'].includes(input.mode);
  const centered = fresh && input.mode === 'motion' && !input.calibrating;
  const checks: ConnectionCheck[] = [
    {
      label: 'Serveur',
      state: input.relayOpen ? 'ok' : 'blocked',
      detail: input.relayOpen
        ? 'Connexion de ce téléphone au relais ouverte.'
        : 'La connexion au relais n’est pas ouverte.',
    },
    {
      label: 'Association',
      state: input.relayOpen && input.associated ? 'ok' : 'waiting',
      detail:
        input.relayOpen && input.associated
          ? 'Ce téléphone a rejoint le salon.'
          : 'En attente de confirmation du serveur.',
    },
    {
      label: 'Adresse',
      state:
        input.https && input.secureContext
          ? 'ok'
          : touch || input.secureContext
            ? 'unused'
            : 'blocked',
      detail:
        input.https && input.secureContext
          ? 'Cette page est ouverte en HTTPS dans un contexte sécurisé.'
          : input.secureContext
            ? 'Contexte local sécurisé ; ce n’est pas une adresse HTTPS.'
            : 'Adresse HTTP : utilisez Tactile ou scannez le QR HTTPS du PC.',
    },
    {
      label: 'Capteurs',
      state: touch ? 'unused' : fresh ? 'ok' : 'waiting',
      detail: touch
        ? 'Inutiles en mode tactile.'
        : fresh
          ? 'Données de mouvement récentes reçues sur ce téléphone.'
          : input.hidden
            ? 'Vérification suspendue en arrière-plan.'
            : 'Aucune donnée récente confirmée.',
    },
    {
      label: touch ? 'Tactile' : 'Centrage',
      state: paired && ((touch && !input.hidden) || centered) ? 'ok' : 'waiting',
      detail: touch
        ? !paired
          ? 'Disponible après la reconnexion du téléphone.'
          : input.hidden
            ? 'Revenez dans cet onglet pour jouer.'
            : 'Pavé tactile disponible dans cet onglet.'
        : centered
          ? 'Calibration terminée et capteurs frais.'
          : 'Centrez la lame avant de jouer.',
    },
  ];
  if (!input.relayOpen || !input.associated)
    return {
      title: input.connectionError ? 'Connexion à reprendre' : 'Connexion en cours',
      detail:
        input.connectionError ||
        'Attendez la confirmation du serveur. Si elle ne vient pas, vérifiez le code actuel sur le PC.',
      state: input.connectionError ? 'blocked' : 'waiting',
      checks,
      action: 'retry',
    };
  if (input.hidden)
    return {
      title: 'Commandes suspendues',
      detail: 'Revenez dans cet onglet et gardez l’écran allumé.',
      state: 'waiting',
      checks,
    };
  if (touch)
    return {
      title: 'Tactile prêt',
      detail: 'Glissez sur le pavé et regardez le PC.',
      state: 'ok',
      checks,
    };
  if (!input.secureContext)
    return {
      title: 'Le gyroscope demande HTTPS',
      detail: 'Scannez le QR HTTPS actuel sur le PC, ou choisissez le tactile.',
      state: 'blocked',
      checks,
      action: 'touch',
    };
  if (centered)
    return {
      title: 'Gyroscope prêt',
      detail: 'La lame est centrée et les capteurs sont actifs.',
      state: 'ok',
      checks,
    };
  if (input.mode === 'calibration')
    return {
      title: fresh ? 'Centrez votre lame' : 'Mouvement à retrouver',
      detail:
        input.sensorError ||
        'Tenez le téléphone devant vous, puis gardez-le immobile un court instant.',
      state: 'waiting',
      checks,
      action: fresh ? (input.calibrating ? undefined : 'calibrate') : 'sensors',
    };
  return {
    title: input.mode === 'listening' ? 'Détection du mouvement' : 'Préparez le gyroscope',
    detail: input.sensorError || 'Autorisez les capteurs puis inclinez doucement le téléphone.',
    state: input.sensorError ? 'blocked' : 'waiting',
    checks,
    action: input.mode === 'listening' ? undefined : 'sensors',
  };
}
