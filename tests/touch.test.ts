import assert from 'node:assert/strict';
import test from 'node:test';
import { TouchTracker } from '../src/touch.js';

test('un flick terminé entre deux ticks est livré une seule fois avec son vrai début', () => {
  const touch = new TouchTracker();
  touch.begin(1, 0.1, 0.2, 1);
  touch.move(1, 0.8, 0.2, 8);
  touch.end(1, 0.9, 0.2, 12);
  const cut = touch.take(34);
  assert.deepEqual([cut.fromX, cut.fromY, cut.x, cut.y, cut.slash], [0.1, 0.2, 0.9, 0.2, true]);
  assert.equal(touch.take(68).slash, false);
});

test('les petits mouvements s’accumulent entre envois sans seuil par événement', () => {
  const touch = new TouchTracker();
  touch.begin(1, 0.1, 0.2, 0);
  for (let i = 1; i <= 6; i++) touch.move(1, 0.1 + i * 0.001, 0.2, i * 4);
  const cut = touch.take(34);
  assert.equal(cut.slash, true);
  assert.equal(cut.fromX, 0.1);
  assert.ok(Math.abs(cut.x - 0.106) < 1e-12);
  touch.move(1, 0.11, 0.2, 40);
  assert.equal(touch.take(68).fromX, cut.x);
});

test('deux touchers rapides restent deux segments sans pont depuis la position précédente', () => {
  const touch = new TouchTracker();
  touch.begin(1, 0.1, 0.1, 0);
  touch.end(1, 0.2, 0.1, 5);
  touch.begin(2, 0.8, 0.8, 10);
  touch.end(2, 0.9, 0.8, 15);
  assert.equal(touch.take(34).fromX, 0.1);
  const second = touch.take(68);
  assert.deepEqual([second.fromX, second.fromY], [0.8, 0.8]);
  assert.equal(touch.take(102).slash, false);
});

test('pointercancel et suspension effacent coups et mélange en attente', () => {
  const touch = new TouchTracker();
  touch.begin(1, 0.1, 0.1, 0);
  touch.move(1, 0.9, 0.9, 10);
  touch.cancel(1);
  assert.equal(touch.take(34).slash, false);
  assert.equal(touch.visual(34).stir, 0);
  touch.begin(2, 0.2, 0.2, 40);
  touch.end(2, 0.7, 0.2, 45);
  touch.cancel();
  assert.equal(touch.take(68).slash, false);
});

test('un redimensionnement conserve le doigt actif sans transformer le recalage en coupe', () => {
  const touch = new TouchTracker();
  touch.begin(1, 0.3, 0.4, 0);
  touch.move(1, 0.4, 0.5, 20);
  touch.rebase(0.4, 0.65, 30);
  assert.equal(touch.pointerId, 1);
  assert.deepEqual(touch.take(34), { x: 0.4, y: 0.65, slash: false, stir: 0 });
  touch.move(1, 0.7, 0.65, 45);
  const cut = touch.take(68);
  assert.deepEqual([cut.fromX, cut.fromY, cut.x, cut.slash], [0.4, 0.65, 0.7, true]);
  touch.end(1, 0.75, 0.65, 70);
  assert.equal(touch.pointerId, null);
});

test('une transition continue oublie les gestes anciens et accepte le prochain mouvement', () => {
  const touch = new TouchTracker();
  touch.begin(1, 0.1, 0.2, 0);
  touch.move(1, 0.3, 0.2, 10);
  const position = touch.visual(20);
  touch.rebase(position.x, position.y, 20);
  assert.equal(touch.take(34).slash, false);
  touch.move(1, 0.4, 0.2, 50);
  assert.equal(touch.take(68).slash, true);
  touch.cancel();
  touch.rebase(0.5, 0.5, 75);
  assert.equal(touch.pointerId, null);
  touch.move(1, 0.8, 0.5, 80);
  assert.equal(touch.take(102).slash, false);
});

test('la perte de capture après pointerup conserve le flick, un autre doigt est ignoré', () => {
  const touch = new TouchTracker();
  assert.equal(touch.begin(1, 0.1, 0.1, 0), true);
  assert.equal(touch.begin(2, 0.8, 0.8, 1), false);
  touch.move(2, 0.9, 0.9, 5);
  assert.equal(touch.visual(6).x, 0.1);
  touch.end(1, 0.2, 0.1, 10);
  touch.cancel(1);
  assert.equal(touch.take(34).slash, true);
});

test('une congestion ne rejoue pas des coupes anciennes après 150ms', () => {
  const touch = new TouchTracker();
  touch.begin(1, 0.1, 0.1, 0);
  touch.move(1, 0.2, 0.1, 10);
  assert.equal(touch.take(200).slash, false);
  touch.move(1, 0.3, 0.1, 210);
  const cut = touch.take(220);
  assert.equal(cut.fromX, 0.2);
  assert.equal(cut.slash, true);
});

test('les coordonnées sont bornées, les données invalides refusées et un tap ne coupe pas', () => {
  const touch = new TouchTracker();
  assert.equal(touch.begin(1, NaN, 0, 0), false);
  touch.begin(1, -5, 4, 0);
  touch.end(1, -5, 4, 5);
  assert.deepEqual(touch.take(34), { x: 0, y: 1, slash: false, stir: 0 });
  touch.reset();
  assert.deepEqual(touch.visual(40), { x: 0.5, y: 0.5, slash: false, stir: 0 });
});
