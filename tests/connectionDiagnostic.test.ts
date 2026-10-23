import assert from 'node:assert/strict';
import test from 'node:test';
import {
  configuredControllerOrigin,
  controllerAddress,
  hostConnectionReport,
  phoneConnectionReport,
} from '../src/connectionDiagnostic';

test('un QR pour un autre appareil refuse loopback et identifiants, mais garde les adresses LAN', () => {
  for (const url of [
    'http://localhost:5174',
    'https://demo.localhost',
    'http://127.0.0.1',
    'http://127.8.2.1',
    'http://[::1]',
    'http://[::ffff:127.0.0.1]:5174',
    'https://[::ffff:127.42.3.4]',
    'http://0.0.0.0',
    'http://2130706433',
    'https://user:secret@example.com',
    'javascript:alert(1)',
  ]) {
    assert.equal(controllerAddress(url).usable, false, url);
  }
  assert.equal(controllerAddress('http://192.168.1.4:5174').usable, true);
  assert.equal(controllerAddress('http://192.168.1.4:5174').secure, false);
  assert.equal(
    controllerAddress('https://cuisine.example/controller').origin,
    'https://cuisine.example',
  );
});

test('la sélection du lien privilégie la configuration courante et ne revient jamais à localhost', () => {
  const local = { localUrls: ['http://127.0.0.1:5174', 'http://192.168.1.4:5174'], secure: false };
  assert.equal(
    configuredControllerOrigin(local, 'http://localhost:5174'),
    'http://192.168.1.4:5174',
  );
  assert.equal(
    configuredControllerOrigin(
      { ...local, controllerOrigin: 'https://new.example' },
      'https://old.example',
    ),
    'https://new.example',
  );
  assert.equal(
    configuredControllerOrigin({ localUrls: [], secure: false }, 'http://localhost:5174'),
    '',
  );
  assert.equal(configuredControllerOrigin(local, 'https://proxy.example'), 'https://proxy.example');
  assert.throws(() =>
    configuredControllerOrigin(
      { localUrls: [], secure: true, controllerOrigin: 'http://localhost' },
      'https://pc.example',
    ),
  );
  assert.throws(() =>
    configuredControllerOrigin({ localUrls: 'broken', secure: false }, 'http://localhost'),
  );
  assert.throws(() => configuredControllerOrigin(null, 'http://localhost'));
});

test('le PC ne confond pas téléphone associé et commandes réellement reçues', () => {
  const base = { online: true, code: 'ABCDEF', connected: true };
  const unknown = hostConnectionReport(base);
  assert.equal(unknown.state, 'waiting');
  assert.equal(unknown.checks.find((check) => check.label === 'Commandes')?.state, 'waiting');
  const ready = hostConnectionReport({ ...base, ready: true, source: 'touch' });
  assert.equal(ready.state, 'ok');
  assert.match(ready.checks.at(-1)!.detail, /Tactile reçu/);
  const lost = hostConnectionReport({ ...base, ready: false, source: 'touch' });
  assert.equal(lost.state, 'waiting');
  assert.doesNotMatch(lost.title, /Calibration/);
});

test('une coupure ou un nouveau salon invalident les anciens voyants PC', () => {
  for (const state of [
    { online: false, code: 'ABCDEF' },
    { online: true, code: '' },
  ]) {
    const report = hostConnectionReport({
      ...state,
      connected: true,
      ready: true,
      source: 'motion',
    });
    assert.notEqual(report.state, 'ok');
    assert.notEqual(report.checks.find((check) => check.label === 'Téléphone')?.state, 'ok');
    assert.notEqual(report.checks.find((check) => check.label === 'Commandes')?.state, 'ok');
  }
  const refused = hostConnectionReport({
    online: true,
    code: '',
    connected: false,
    error: 'Serveur occupé.',
  });
  assert.equal(refused.state, 'blocked');
  assert.match(refused.detail, /Serveur occupé/);
});

const phone = {
  relayOpen: true,
  associated: true,
  connectionError: '',
  secureContext: true,
  https: true,
  hidden: false,
  mode: 'motion' as const,
  fresh: true,
  hasOrientation: true,
  sensorError: '',
  calibrating: false,
};

test('le téléphone gyro prêt exige des capteurs frais et un centrage terminé', () => {
  assert.equal(phoneConnectionReport(phone).state, 'ok');
  for (const change of [
    { fresh: false },
    { hasOrientation: false },
    { calibrating: true },
    { mode: 'calibration' as const },
    { hidden: true },
  ]) {
    const report = phoneConnectionReport({ ...phone, ...change });
    assert.notEqual(report.state, 'ok');
    assert.notEqual(report.checks.find((check) => check.label === 'Centrage')?.state, 'ok');
  }
});

test('une ancienne permission ne fait jamais apparaître les capteurs prêts en setup', () => {
  const report = phoneConnectionReport({
    ...phone,
    mode: 'setup',
    fresh: true,
    sensorError: 'Permission refusée',
  });
  assert.equal(report.state, 'blocked');
  assert.notEqual(report.checks.find((check) => check.label === 'Capteurs')?.state, 'ok');
  assert.equal(report.action, 'sensors');
});

test('HTTP bloque le gyro mais permet un tactile associé sans exiger de capteurs', () => {
  const insecure = { ...phone, secureContext: false, https: false, fresh: false };
  const gyro = phoneConnectionReport(insecure);
  assert.equal(gyro.state, 'blocked');
  assert.equal(gyro.action, 'touch');
  const touch = phoneConnectionReport({ ...insecure, mode: 'touch' });
  assert.equal(touch.state, 'ok');
  assert.equal(touch.checks.find((check) => check.label === 'Capteurs')?.state, 'unused');
  assert.notEqual(touch.checks.find((check) => check.label === 'Adresse')?.state, 'ok');
});

test('le tactile local ne suffit pas à annoncer une connexion prête après coupure', () => {
  const report = phoneConnectionReport({
    ...phone,
    mode: 'touch',
    relayOpen: false,
    connectionError: 'Connexion interrompue',
  });
  assert.equal(report.state, 'blocked');
  assert.equal(report.action, 'retry');
  assert.notEqual(report.checks.find((check) => check.label === 'Association')?.state, 'ok');
  assert.notEqual(report.checks.find((check) => check.label === 'Tactile')?.state, 'ok');
});
