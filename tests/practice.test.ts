import assert from 'node:assert/strict';
import test from 'node:test';
import type { InputMessage } from '../shared/protocol.js';
import { PracticeLesson, PRACTICE_TRAP_SECONDS } from '../src/game/practice.js';
import { RECIPES } from '../src/game/recipes.js';

const packet = (values: Partial<InputMessage> = {}): InputMessage => ({
  type: 'input',
  source: 'touch',
  x: 0,
  y: 0.53,
  slash: false,
  stir: 0,
  seq: 1,
  ...values,
});
function advance(lesson: PracticeLesson, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 100); i++) lesson.tick(0.01);
}
function create(source: 'motion' | 'touch' = 'touch') {
  const lesson = new PracticeLesson(RECIPES[0], source);
  lesson.resize(1000, 600);
  lesson.setEnabled(true);
  return lesson;
}
function cut(lesson: PracticeLesson, now = 100) {
  const { x, y } = lesson.target;
  lesson.receive(packet({ x: x - 0.15, y }), now);
  return lesson.receive(
    packet({ x: x + 0.15, y, fromX: x - 0.15, fromY: y, slash: true }),
    now + 34,
  );
}
function reachTrap(lesson: PracticeLesson) {
  assert.equal(cut(lesson).feedback, 'cut');
  advance(lesson, 0.71);
  assert.equal(cut(lesson, 1000).feedback, 'cut');
  advance(lesson, 0.71);
  assert.equal(lesson.step, 2);
  assert.equal(lesson.completed, 2);
}

test('chaque recette enseigne deux ingrédients distincts puis un vrai piège', () => {
  for (const recipe of RECIPES) {
    const lesson = new PracticeLesson(recipe, 'touch');
    assert.equal(new Set(lesson.foods).size, 3);
    assert.ok(recipe.ingredients.includes(lesson.foods[0]));
    assert.ok(recipe.ingredients.includes(lesson.foods[1]));
    assert.ok(recipe.traps.includes(lesson.foods[2]));
  }
});

test('deux coupes et un piège laissé sortir terminent le parcours sans score', () => {
  const lesson = create();
  reachTrap(lesson);
  advance(lesson, PRACTICE_TRAP_SECONDS + 0.71);
  assert.equal(lesson.phase, 'complete');
  assert.equal(lesson.completed, 3);
  assert.equal(lesson.target.visible, false);
});

test('couper le piège recommence seulement cette étape, sans perdre les bons gestes', () => {
  const lesson = create();
  reachTrap(lesson);
  advance(lesson, 1.7);
  assert.equal(cut(lesson, 2000).feedback, 'mistake');
  assert.equal(lesson.completed, 2);
  advance(lesson, 1.11);
  assert.equal(lesson.step, 2);
  assert.equal(lesson.phase, 'active');
  assert.ok(lesson.trapElapsed < 0.02);
  advance(lesson, PRACTICE_TRAP_SECONDS + 0.71);
  assert.equal(lesson.completed, 3);
});

test('déconnexion : piège et retour d’erreur figés, aucun geste reçu ne compte', () => {
  const lesson = create();
  reachTrap(lesson);
  advance(lesson, 1.5);
  const before = { ...lesson.target, elapsed: lesson.trapElapsed };
  lesson.setEnabled(false);
  advance(lesson, 10);
  assert.equal(cut(lesson).feedback, null);
  assert.deepEqual({ ...lesson.target, elapsed: lesson.trapElapsed }, before);
  lesson.setEnabled(true);
  assert.equal(cut(lesson, 2000).feedback, 'mistake');
  lesson.setEnabled(false);
  advance(lesson, 10);
  assert.equal(lesson.feedback, 'mistake');
  assert.equal(lesson.phase, 'feedback');
  lesson.setEnabled(true);
  advance(lesson, 1.11);
  assert.equal(lesson.phase, 'active');
  assert.equal(lesson.step, 2);
});

test('le tactile emploie son propre début : aucun pont entre deux touchers', () => {
  const lesson = create();
  lesson.receive(packet({ x: 0.1 }), 100);
  const result = lesson.receive(packet({ x: 0.9, fromX: 0.8, fromY: 0.53, slash: true }), 134);
  assert.equal(result.feedback, null);
  assert.equal(lesson.completed, 0);
  assert.equal(lesson.receive(packet({ x: 0.1, slash: true }), 168).segment, null);
  assert.equal(lesson.completed, 0);
});

test('stationnaire, visée seule et geste hors de l’aliment ne valident rien', () => {
  const lesson = create();
  const { x, y } = lesson.target;
  lesson.receive(packet({ x, y }), 100);
  for (let i = 1; i <= 50; i++) {
    assert.equal(
      lesson.receive(packet({ x, y, fromX: x, fromY: y, slash: true }), 100 + i * 34).feedback,
      null,
    );
  }
  assert.equal(lesson.receive(packet({ x: 0.8, y, fromX: 0.1, fromY: y }), 2000).feedback, null);
  assert.equal(
    lesson.receive(packet({ x: 0.8, y: 0.1, fromX: 0.1, fromY: 0.1, slash: true }), 2034).feedback,
    null,
  );
  assert.equal(lesson.completed, 0);
});

test('gyroscope : premier paquet après pause et mesure périmée ne créent pas de coupe', () => {
  const lesson = create('motion');
  lesson.receive(packet({ source: 'motion', x: 0.1 }), 100);
  lesson.setEnabled(false);
  lesson.setEnabled(true);
  assert.equal(
    lesson.receive(packet({ source: 'motion', x: 0.7, slash: true }), 134).feedback,
    null,
  );
  assert.equal(
    lesson.receive(packet({ source: 'motion', x: 0.1, slash: true }), 500).feedback,
    null,
  );
  assert.equal(
    lesson.receive(packet({ source: 'motion', x: 0.7, slash: true }), 534).feedback,
    'cut',
  );
});

test('changement de commande et redimensionnement neutralisent le segment précédent', () => {
  const lesson = create('motion');
  lesson.receive(packet({ source: 'motion', x: 0.1 }), 100);
  lesson.setSource('touch');
  assert.equal(
    lesson.receive(packet({ x: 0.7, fromX: 0.1, fromY: 0.53, slash: true }), 134).feedback,
    null,
  );
  lesson.resize(500, 600);
  assert.equal(
    lesson.receive(packet({ x: 0.1, fromX: 0.7, fromY: 0.53, slash: true }), 168).feedback,
    null,
  );
  assert.equal(cut(lesson, 200).feedback, 'cut');
});

test('un seul geste ne coupe pas aussi l’ingrédient suivant', () => {
  const lesson = create();
  assert.equal(cut(lesson).feedback, 'cut');
  assert.equal(cut(lesson, 200).feedback, null);
  advance(lesson, 0.71);
  assert.equal(lesson.step, 1);
  assert.equal(
    lesson.receive(packet({ x: 0.9, fromX: 0.1, fromY: 0.53, slash: true }), 1000).feedback,
    null,
  );
  assert.equal(cut(lesson, 1100).feedback, 'cut');
});

test('la collision garde une taille en pixels cohérente sur un écran large ou étroit', () => {
  for (const [width, height] of [
    [1200, 600],
    [320, 600],
    [600, 320],
  ]) {
    const lesson = create();
    lesson.resize(width, height);
    assert.ok(Math.abs(lesson.target.radiusX * width - lesson.target.radiusY * height) < 1e-9);
    assert.equal(cut(lesson).feedback, 'cut');
  }
});
