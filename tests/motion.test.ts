import assert from 'node:assert/strict';
import test from 'node:test';
import { angleDelta, MotionTracker } from '../src/motion.js';

type SensorEvent = Pick<
  DeviceMotionEvent,
  'rotationRate' | 'acceleration' | 'accelerationIncludingGravity'
>;
const sensor = (overrides: Partial<SensorEvent> = {}): SensorEvent => ({
  rotationRate: null,
  acceleration: null,
  accelerationIncludingGravity: null,
  ...overrides,
});
const rate = (gamma: number, alpha = 0) => sensor({ rotationRate: { alpha, beta: 0, gamma } });
const hold = (tracker: MotionTracker, start = 0, beta = 40, gamma = 0) => {
  for (let time = start; time <= start + 400; time += 40) tracker.orientation(beta, gamma, time);
};
const calibrated = () => {
  const tracker = new MotionTracker();
  hold(tracker);
  assert.equal(tracker.calibrate(400), true);
  return tracker;
};

test('la calibration demande des événements valides, frais et stables sur une durée réelle', () => {
  const tracker = new MotionTracker();
  assert.equal(tracker.calibrate(0), false);
  tracker.orientation(Number.NaN, 0, 0);
  tracker.orientation(30, Infinity, 10);
  assert.equal(tracker.hasOrientation, false);
  tracker.orientation(40, 0, 20);
  assert.equal(tracker.calibrate(20), false);
  hold(tracker, 40);
  assert.equal(tracker.calibrationStatus(440).ready, true);
  assert.equal(tracker.calibrate(440), true);
  assert.deepEqual(tracker.sample(440), { x: 0.5, y: 0.5, slash: false, stir: 0 });
  assert.equal(tracker.calibrate(3000), false);
  assert.equal(tracker.calibrationStatus(3000).reason, 'stale');
});

test('la calibration refuse une main en mouvement puis accepte une pose stabilisée', () => {
  const tracker = new MotionTracker();
  for (let time = 0; time <= 400; time += 40) tracker.orientation(40, time / 20, time);
  assert.equal(tracker.calibrationStatus(400).reason, 'moving');
  assert.equal(tracker.calibrate(400), false);
  hold(tracker, 440, 40, 20);
  assert.equal(tracker.calibrate(840), true);
  tracker.motion(rate(80), 860);
  assert.equal(tracker.calibrationStatus(860).ready, false);
});

test('un navigateur à orientation événementielle peut confirmer sa stabilité par le gyroscope', () => {
  const tracker = new MotionTracker();
  tracker.orientation(40, 0, 0);
  for (let time = 40; time <= 400; time += 40) tracker.motion(rate(0), time);
  assert.equal(tracker.calibrate(400), true);
  assert.deepEqual(tracker.sample(400), { x: 0.5, y: 0.5, slash: false, stir: 0 });
});

test('les angles circulaires et leur moyenne évitent un saut au passage de 180°', () => {
  assert.equal(angleDelta(-179, 179), 2);
  assert.equal(angleDelta(179, -179), -2);
  assert.equal(angleDelta(-1080, 0), 0);
  const tracker = new MotionTracker();
  for (let time = 0; time <= 400; time += 40)
    tracker.orientation(time % 80 ? 179.8 : -179.8, 0, time);
  assert.equal(tracker.calibrate(400), true);
  tracker.orientation(-179.7, 0, 450);
  assert.equal(tracker.sample(450).slash, false);
  assert.ok(Math.abs(tracker.sample(450).y - 0.5) < 0.01);
});

test('le lissage temporel donne la même réponse à 30, 60 et 120 Hz', () => {
  const responses = [30, 60, 120].map((hz) => {
    const tracker = calibrated();
    for (let step = 1; step <= hz / 10; step += 1)
      tracker.orientation(40, 16, 400 + (step * 1000) / hz);
    return tracker.sample(500).x;
  });
  assert.ok(responses[0]! > 0.7);
  assert.ok(Math.max(...responses) - Math.min(...responses) < 1e-10);
});

test('la zone neutre absorbe le tremblement mais reste continue pour les petits ajustements', () => {
  const tracker = calibrated();
  tracker.orientation(40.2, 0.3, 450);
  assert.deepEqual(tracker.sample(450), { x: 0.5, y: 0.5, slash: false, stir: 0 });
  tracker.orientation(40, 0.5, 500);
  assert.ok(tracker.sample(500).x > 0.5 && tracker.sample(500).x < 0.503);
});

test('la sensibilité, le paysage et les limites du pointeur sont cohérents', () => {
  const normal = calibrated();
  const sensitive = calibrated();
  sensitive.sensitivity = 1.8;
  normal.orientation(40, 8, 500);
  sensitive.orientation(40, 8, 500);
  assert.ok(sensitive.sample(500).x > normal.sample(500).x);
  const landscape = calibrated();
  landscape.orientation(40, 8, 500, 90);
  assert.ok(Math.abs(landscape.sample(500).x - 0.5) < 1e-10);
  assert.ok(landscape.sample(500).y < 0.5);
  for (let time = 600; time < 1000; time += 20) normal.orientation(-140, 90, time);
  const { x, y } = normal.sample(1000);
  assert.ok(x >= 0.99 && x <= 1 && y >= 0 && y < 0.01);
});

test('une rotation sans déplacement de visée ne déclenche plus de fausse coupe', () => {
  const tracker = calibrated();
  tracker.motion(rate(0, 160), 450);
  assert.equal(tracker.sample(450).slash, false);
  tracker.motion(rate(160), 480);
  assert.equal(tracker.sample(480).slash, false);
  tracker.orientation(40, 9, 500);
  assert.equal(tracker.sample(500).slash, true);
});

test('les petites corrections ne coupent pas et la lame expire rapidement au repos', () => {
  const tracker = calibrated();
  tracker.motion(rate(35), 450);
  tracker.orientation(40, 1, 460);
  assert.equal(tracker.sample(460).slash, false);
  tracker.motion(rate(95), 490);
  tracker.orientation(40, 8, 510);
  assert.equal(tracker.sample(510).slash, true);
  assert.equal(tracker.sample(594).slash, true);
  assert.equal(tracker.sample(595).slash, false);
});

test('l’hystérésis maintient un geste régulier puis permet le geste suivant sans cooldown long', () => {
  const tracker = calibrated();
  tracker.motion(rate(100), 440);
  tracker.orientation(40, 6, 460);
  assert.equal(tracker.sample(460).slash, true);
  tracker.motion(rate(55), 480);
  tracker.orientation(40, 8, 495);
  assert.equal(tracker.sample(495).slash, true);
  tracker.motion(rate(0), 510);
  assert.equal(tracker.sample(600).slash, false);
  tracker.motion(rate(100), 610);
  tracker.orientation(40, 20, 620);
  assert.equal(tracker.sample(620).slash, true);
});

test('un gyroscope au repos prime sur l’orientation bruitée et le secours reprend après silence gyro', () => {
  const tracker = calibrated();
  tracker.motion(rate(0), 440);
  tracker.orientation(40, 10, 460);
  assert.equal(tracker.sample(460).slash, false);
  tracker.orientation(40, 10, 740);
  tracker.orientation(40, 20, 800);
  assert.equal(tracker.sample(800).slash, true);
});

test('un gyroscope partiel ne bloque pas le secours orientation pour les axes manquants', () => {
  const tracker = calibrated();
  tracker.motion(sensor({ rotationRate: { alpha: 0, beta: null, gamma: null } }), 440);
  tracker.orientation(40, 12, 460);
  assert.equal(tracker.sample(460).slash, true);
});

test('un retour après une interruption ne coupe pas et recentrer exige à nouveau une pose stable', () => {
  const tracker = calibrated();
  tracker.orientation(70, 30, 5000);
  assert.equal(tracker.sample(5000).slash, false);
  tracker.beginCalibration();
  assert.equal(tracker.calibrate(5000), false);
  hold(tracker, 5040, 70, 30);
  assert.equal(tracker.calibrate(5440), true);
  assert.deepEqual(tracker.sample(5440), { x: 0.5, y: 0.5, slash: false, stir: 0 });
});

test('un retour rapide ou une rotation d’écran ne peut pas réutiliser une ancienne calibration', () => {
  const tracker = calibrated();
  tracker.beginCalibration();
  assert.equal(tracker.hasOrientation, false);
  assert.equal(tracker.calibrate(410), false);
  // Even live zero-rate gyro events cannot recreate an orientation never received after return.
  for (let time = 420; time <= 840; time += 40) tracker.motion(rate(0), time);
  assert.equal(tracker.calibrate(840), false);
  tracker.orientation(65, 20, 860);
  assert.equal(tracker.calibrate(860), false);
  hold(tracker, 900, 65, 20);
  assert.equal(tracker.calibrate(1300), true);
  assert.deepEqual(tracker.sample(1300), { x: 0.5, y: 0.5, slash: false, stir: 0 });
});

test('la fraîcheur se fonde sur des capteurs réels, y compris un appareil immobile', () => {
  const tracker = calibrated();
  assert.equal(tracker.isFresh(1600), true);
  assert.equal(tracker.isFresh(1601), false);
  tracker.motion(sensor(), 1700);
  assert.equal(tracker.isFresh(1700), false);
  tracker.motion(rate(0), 1800);
  assert.equal(tracker.isFresh(1800), true);
  assert.equal(tracker.isFresh(3100), false);
  assert.equal(tracker.sample(3100).stir, 0);
});

test('la gravité au repos ne compte pas comme mélange, même après recentrage', () => {
  const tracker = calibrated();
  const resting = sensor({ accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 } });
  for (let time = 440; time <= 600; time += 40) tracker.motion(resting, time);
  assert.equal(tracker.sample(600).stir, 0);
  hold(tracker, 640);
  tracker.calibrate(1040);
  tracker.motion(sensor({ accelerationIncludingGravity: { x: 0, y: 9.81, z: 0 } }), 1060);
  assert.equal(tracker.sample(1060).stir, 0);
});

test('le mélange accepte toute rotation ou accélération, puis décroît sans données', () => {
  const tracker = calibrated();
  tracker.motion(rate(0, 200), 450);
  assert.equal(tracker.sample(450).slash, false);
  assert.equal(tracker.sample(450).stir, 1);
  assert.ok(tracker.sample(850).stir < 0.1);
  tracker.motion(sensor({ acceleration: { x: 12, y: 0, z: 0 } }), 900);
  assert.equal(tracker.sample(900).stir, 1);
  assert.equal(tracker.sample(2200).stir, 0);
});

test('les données non finies et événements hors ordre ne contaminent ni fraîcheur ni pointeur', () => {
  const tracker = calibrated();
  tracker.motion(sensor({ rotationRate: { alpha: NaN, beta: Infinity, gamma: null } }), 2000);
  assert.equal(tracker.isFresh(2000), false);
  tracker.orientation(50, 25, 300);
  assert.deepEqual(tracker.sample(400), { x: 0.5, y: 0.5, slash: false, stir: 0 });
  tracker.motion(rate(0), 500);
  tracker.motion(rate(200), 450);
  assert.equal(tracker.sample(500).slash, false);
});
