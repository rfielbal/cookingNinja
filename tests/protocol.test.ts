import assert from 'node:assert/strict';
import test from 'node:test';
import { BLADES, DEFAULT_BLADE, isBladeId } from '../shared/blades.js';
import { parseClientMessage } from '../shared/protocol.js';

const legacyState = {
  type: 'game:state',
  phase: 'ready',
  recipe: 'Burger',
  hearts: 3,
  score: 0,
} as const;

test('les lames ont des identifiants uniques, des couleurs CSS et un choix par défaut valide', () => {
  assert.equal(DEFAULT_BLADE, 'citrus');
  assert.deepEqual(
    BLADES.map(({ id }) => id),
    ['citrus', 'mint', 'berry'],
  );
  assert.deepEqual(
    BLADES.map(({ name }) => name),
    ['Zeste', 'Menthe', 'Prune'],
  );
  assert.deepEqual(
    BLADES.map(({ color }) => color),
    ['#ffb45f', '#80f5c1', '#d7a2ff'],
  );
  for (const blade of BLADES) {
    assert.equal(isBladeId(blade.id), true);
    assert.match(blade.glow, /^#[\da-f]{6}$/i);
  }
  for (const invalid of [undefined, null, '', 'CITRUS', 'red', {}, 0])
    assert.equal(isBladeId(invalid), false);
});

test('chaque action autorisée est normalisée et les propriétés supplémentaires sont retirées', () => {
  for (const action of ['start', 'pause', 'resume']) {
    assert.deepEqual(
      parseClientMessage({ type: 'controller:action', action, score: 100, phase: 'result' }),
      { type: 'controller:action', action },
    );
  }
  for (const action of [undefined, null, '', 'START', 'stop', 'finish', 1, {}, ['start']]) {
    assert.equal(parseClientMessage({ type: 'controller:action', action }), null);
  }
});

test('les réglages exigent un mode téléphone et une lame connus', () => {
  for (const mode of ['motion', 'touch']) {
    for (const { id: blade } of BLADES) {
      assert.deepEqual(
        parseClientMessage({ type: 'controller:settings', mode, blade, extra: true }),
        { type: 'controller:settings', mode, blade },
      );
    }
  }
  for (const mode of [undefined, null, '', 'mouse', 'MOTION', 0])
    assert.equal(parseClientMessage({ type: 'controller:settings', mode, blade: 'citrus' }), null);
  for (const blade of [undefined, null, '', 'orange', 1, {}])
    assert.equal(parseClientMessage({ type: 'controller:settings', mode: 'touch', blade }), null);
});

test('les anciens états reçoivent des valeurs complètes et les autorisations restent désactivées', () => {
  assert.deepEqual(parseClientMessage(legacyState), {
    ...legacyState,
    canStart: false,
    canResume: false,
    starting: false,
    blade: 'citrus',
    controlMode: 'mouse',
    notice: '',
  });
});

test('le compte à rebours, les permissions et la personnalisation du PC sont préservés', () => {
  const state = {
    ...legacyState,
    phase: 'countdown',
    canStart: false,
    canResume: false,
    starting: true,
    blade: 'berry',
    controlMode: 'motion',
    notice: 'Prêt dans 3…',
  };
  assert.deepEqual(parseClientMessage({ ...state, unknown: 'removed' }), state);
  for (const controlMode of ['motion', 'touch', 'mouse']) {
    const parsed = parseClientMessage({ ...state, controlMode });
    assert.equal(parsed?.type === 'game:state' && parsed.controlMode, controlMode);
  }
});

test('les états présents mais invalides ne sont jamais remplacés silencieusement par un défaut', () => {
  for (const field of ['canStart', 'canResume', 'starting']) {
    for (const value of [null, 0, 1, 'true', {}]) {
      assert.equal(parseClientMessage({ ...legacyState, [field]: value }), null);
    }
  }
  for (const blade of [null, '', 'orange', 0])
    assert.equal(parseClientMessage({ ...legacyState, blade }), null);
  for (const controlMode of [null, '', 'keyboard', 0])
    assert.equal(parseClientMessage({ ...legacyState, controlMode }), null);
  for (const notice of [null, 0, {}, 'x'.repeat(241), 'ligne\nsuivante', '\u0000', '\u007f'])
    assert.equal(parseClientMessage({ ...legacyState, notice }), null);
  assert.notEqual(parseClientMessage({ ...legacyState, notice: 'x'.repeat(240) }), null);
});

test('la validation des états et des mouvements existants demeure stricte', () => {
  for (const patch of [
    { phase: 'arbitrary' },
    { hearts: 4 },
    { score: -1 },
    { score: Number.NaN },
    { recipe: 'x'.repeat(81) },
  ]) {
    assert.equal(parseClientMessage({ ...legacyState, ...patch }), null);
  }
  const input = { type: 'input', x: 0, y: 1, slash: true, stir: 0.5, seq: 0, source: 'motion' };
  assert.deepEqual(parseClientMessage(input), input);
  for (const patch of [
    { x: -0.1 },
    { y: 1.1 },
    { stir: Infinity },
    { seq: 0.5 },
    { seq: -1 },
    { slash: 'true' },
    { source: 'mouse' },
  ]) {
    assert.equal(parseClientMessage({ ...input, ...patch }), null);
  }
});

test('un segment tactile conserve son origine et refuse les coordonnées partielles ou invalides', () => {
  const segment = {
    type: 'input',
    source: 'touch',
    x: 0.8,
    y: 0.4,
    fromX: 0.2,
    fromY: 0.4,
    slash: true,
    stir: 0,
    seq: 4,
  };
  assert.deepEqual(parseClientMessage(segment), segment);
  for (const patch of [
    { fromX: undefined },
    { fromY: undefined },
    { fromX: NaN },
    { fromY: 1.01 },
    { fromX: -0.1 },
    { source: 'motion' },
    { source: undefined },
  ]) {
    assert.equal(parseClientMessage({ ...segment, ...patch }), null);
  }
});
