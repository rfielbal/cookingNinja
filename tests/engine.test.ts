import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTDOWN_SECONDS, CUT_SECONDS, MIX_SECONDS, GameEngine } from '../src/game/engine';
import {
  DANGER_HEARTS,
  FOCUS_CUT_INTERVAL,
  FOCUS_POINTS_PER_CUT,
  FOCUS_SECONDS,
  HEART_SPAWN_TIMES,
  isSpecialKind,
  MAX_HEARTS,
  maximumSpawns,
  RUSH_WINDOWS,
  RUSH_WORLD_SPEED,
  SHINY_SPAWN_TIMES,
  SHIELD_SECONDS,
  SLOW_POINTS,
  SLOW_SECONDS,
  SLOW_WORLD_SPEED,
  type ArenaKind,
} from '../src/game/events';
import { RECIPES } from '../src/game/recipes';

function advance(game: GameEngine, seconds: number, energy = 0) {
  for (let i = 0; i < Math.ceil(seconds * 20); i++) game.tick(0.05, energy);
}
test('three trap cuts cost three hearts; duplicate hits cannot double-count', () => {
  const spawned: string[] = [];
  const game = new GameEngine(
    RECIPES[0],
    (id) => spawned.push(id),
    () => 0,
  );
  game.start();
  advance(game, 6);
  assert.ok(spawned.length >= 3);
  for (const id of spawned.slice(0, 3)) {
    assert.equal(game.hit(id), 'bad');
    assert.equal(game.hit(id), null);
  }
  assert.equal(game.state.hearts, 0);
  assert.equal(game.state.phase, 'result');
  assert.equal(game.state.outcome, 'hearts');
});
test('complete recipe transitions to timed mixing and victory only with movement', () => {
  let game: GameEngine;
  game = new GameEngine(
    RECIPES[0],
    (id, kind) => kind !== 'danger' && game.hit(id),
    () => 0.5,
  );
  game.start();
  advance(game, COUNTDOWN_SECONDS + CUT_SECONDS + 2 * FOCUS_SECONDS + 0.2);
  assert.equal(game.state.phase, 'mixing');
  assert.equal(game.complete, true);
  const score = game.state.score;
  advance(game, MIX_SECONDS + 0.1, 1);
  assert.equal(game.state.outcome, 'won');
  assert.equal(game.state.mix, 1);
  assert.ok(game.state.score > score);
});
test('idle mixing does not award an unearned win', () => {
  let game: GameEngine;
  game = new GameEngine(
    RECIPES[0],
    (id, kind) => kind !== 'danger' && game.hit(id),
    () => 0.5,
  );
  game.start();
  advance(game, COUNTDOWN_SECONDS + CUT_SECONDS + MIX_SECONDS + 2 * FOCUS_SECONDS + 0.3);
  assert.equal(game.state.outcome, 'mix');
});
test('timeout with missing ingredients fails instead of serving incomplete recipe', () => {
  const game = new GameEngine(RECIPES[0], () => {});
  game.start();
  advance(game, COUNTDOWN_SECONDS + CUT_SECONDS + 0.1);
  assert.equal(game.state.outcome, 'ingredients');
});
test('pause freezes countdown, timer, spawn and mixing; resume preserves phase', () => {
  const spawned: string[] = [];
  const game = new GameEngine(RECIPES[0], (id) => spawned.push(id));
  game.start();
  advance(game, 1);
  game.pause();
  const snapshot = game.snapshot();
  advance(game, 10);
  assert.deepEqual(game.snapshot(), snapshot);
  game.resume();
  assert.equal(game.state.phase, 'countdown');
  advance(game, 4);
  game.pause();
  const playing = game.snapshot(),
    count = spawned.length;
  advance(game, 20);
  assert.deepEqual(game.snapshot(), playing);
  assert.equal(spawned.length, count);
  game.resume();
  assert.equal(game.state.phase, 'playing');
});
test('stale or invented ingredient ids do not score', () => {
  const spawned: string[] = [];
  const game = new GameEngine(
    RECIPES[0],
    (id) => spawned.push(id),
    () => 0.5,
  );
  game.start();
  advance(game, 15);
  assert.equal(game.hit('nonexistent'), null);
  assert.equal(game.hit(spawned[0]), null);
  assert.equal(game.state.score, 0);
});

function arena(recipe = RECIPES[0], random = () => 0.5) {
  const spawned: { id: string; kind: ArenaKind; target: boolean; at: number; shiny: boolean }[] =
    [];
  const game = new GameEngine(
    recipe,
    (id, kind, target, shiny) =>
      spawned.push({ id, kind, target, at: game.state.elapsed, shiny: shiny === true }),
    random,
  );
  game.start();
  while (game.state.phase === 'countdown') game.tick(0.05);
  return { game, spawned };
}

function advanceTo(game: GameEngine, elapsed: number) {
  while (game.state.phase === 'playing' && game.state.elapsed < elapsed)
    game.tick(Math.min(0.05, elapsed - game.state.elapsed));
}

test('le score des ingrédients hors événement conserve le combo historique', () => {
  const { game, spawned } = arena();
  advanceTo(game, 3);
  for (const item of spawned.slice(0, 3)) assert.equal(game.hit(item.id), 'good');
  assert.equal(game.state.score, 100 + 110 + 120);
  assert.equal(game.state.hits, 3);
  assert.equal(game.state.combo, 3);
  assert.equal(game.state.bestCombo, 3);
  assert.equal(game.state.feedbackSerial, 3);
});

test('les deux frénésies accélèrent le monde et la cadence sans multiplier les points', () => {
  const { game, spawned } = arena();
  const first = RUSH_WINDOWS[0];
  const length = first.end - first.start;
  advanceTo(game, first.start - 0.1);
  assert.equal(game.state.event, 'normal');
  advanceTo(game, first.start);
  assert.equal(game.state.event, 'rush');
  assert.equal(game.state.eventRemaining, length);
  assert.equal(game.state.worldSpeed, RUSH_WORLD_SPEED);
  const ingredient = spawned.filter((item) => !isSpecialKind(item.kind) && !item.shiny).at(-1)!;
  assert.equal(game.hit(ingredient.id), 'good');
  assert.equal(game.state.score, 100);
  advanceTo(game, first.end);
  assert.equal(game.state.event, 'normal');
  assert.equal(game.state.worldSpeed, 1);
  const normalCount = spawned.filter(
    (item) =>
      !isSpecialKind(item.kind) &&
      !item.shiny &&
      item.at >= first.start - length &&
      item.at < first.start,
  ).length;
  const rushCount = spawned.filter(
    (item) =>
      !isSpecialKind(item.kind) && !item.shiny && item.at >= first.start && item.at < first.end,
  ).length;
  assert.ok(rushCount >= normalCount * 1.35, `${rushCount} rush / ${normalCount} normal`);
  const second = RUSH_WINDOWS[1];
  advanceTo(game, second.start);
  assert.equal(game.state.event, 'rush');
  assert.equal(game.state.eventRemaining, second.end - second.start);
  advanceTo(game, second.end);
  assert.equal(game.state.event, 'normal');
});

test('une étoile active le bouclier sans points, hits ni progression de recette', () => {
  const { game, spawned } = arena();
  advanceTo(game, 8.1);
  const star = spawned.find((item) => item.kind === 'shield')!;
  assert.equal(star.target, true);
  const counts = { ...game.state.counts };
  const serial = game.state.feedbackSerial;
  assert.equal(game.hit(star.id), 'shield');
  assert.equal(game.state.score, 0);
  assert.equal(game.state.hits, 0);
  assert.equal(game.state.combo, 0);
  assert.equal(game.state.shieldRemaining, SHIELD_SECONDS);
  assert.deepEqual(game.state.counts, counts);
  assert.equal(game.state.feedbackSerial, serial + 1);
  assert.equal(game.hit(star.id), null);
  assert.equal(game.state.score, 0);
});

test('le bouclier bloque pièges et bombes sans casser le combo puis expire en dix secondes actives', () => {
  let random = 0.5;
  const { game, spawned } = arena(RECIPES[0], () => random);
  advanceTo(game, 8.1);
  game.hit(spawned.filter((item) => !isSpecialKind(item.kind)).at(-1)!.id);
  game.hit(spawned.find((item) => item.kind === 'shield')!.id);
  const before = { score: game.state.score, hits: game.state.hits, combo: game.state.combo };
  game.pause();
  const paused = game.snapshot();
  advance(game, 10);
  assert.deepEqual(game.snapshot(), paused);
  game.resume();
  random = 0;
  advanceTo(game, 10);
  const trap = spawned.filter((item) => !item.target && item.kind !== 'danger').at(-1)!;
  assert.equal(game.hit(trap.id), 'blocked');
  assert.equal(game.hit(trap.id), null);
  advanceTo(game, 16.1);
  assert.equal(game.hit(spawned.find((item) => item.kind === 'danger')!.id), 'blocked');
  assert.equal(game.state.hearts, 3);
  assert.equal(game.state.mistakes, 0);
  assert.deepEqual(
    { score: game.state.score, hits: game.state.hits, combo: game.state.combo },
    before,
  );
  advanceTo(game, 18.1);
  assert.equal(game.state.shieldRemaining, 0);
  const unprotected = spawned.filter((item) => !item.target && item.kind !== 'danger').at(-1)!;
  assert.equal(game.hit(unprotected.id), 'bad');
  assert.equal(game.state.hearts, 2);
  assert.equal(game.state.mistakes, 1);
});

test('une bombe retire deux cœurs, casse le combo et ne compte que pour une erreur', () => {
  const { game, spawned } = arena();
  advanceTo(game, 16.1);
  const ingredient = spawned.filter((item) => !isSpecialKind(item.kind)).at(-1)!;
  game.hit(ingredient.id);
  const bomb = spawned.find((item) => item.kind === 'danger')!;
  assert.equal(bomb.target, false);
  assert.equal(game.hit(bomb.id), 'danger');
  assert.equal(game.hit(bomb.id), null);
  assert.equal(game.state.hearts, 3 - DANGER_HEARTS);
  assert.equal(game.state.mistakes, 1);
  assert.equal(game.state.combo, 0);
  assert.equal(game.state.bestCombo, 1);
  advanceTo(game, 40.1);
  const secondBomb = spawned.filter((item) => item.kind === 'danger').at(-1)!;
  assert.equal(game.hit(secondBomb.id), 'danger');
  assert.equal(game.state.hearts, 0);
  assert.equal(game.state.mistakes, 2);
  assert.equal(game.state.outcome, 'hearts');
});

test('le sablier ralentit la cadence cinq secondes, reste cumulable au rush et se fige en pause', () => {
  const slow = arena();
  const regular = arena();
  advanceTo(slow.game, 31);
  advanceTo(regular.game, 31);
  const hourglass = slow.spawned.find((item) => item.kind === 'slow')!;
  assert.equal(slow.game.hit(hourglass.id), 'slow');
  assert.equal(slow.game.state.score, SLOW_POINTS);
  assert.equal(slow.game.state.event, 'slow');
  assert.equal(slow.game.state.eventRemaining, SLOW_SECONDS);
  assert.equal(slow.game.state.worldSpeed, SLOW_WORLD_SPEED);
  const beforeCount = slow.spawned.length;
  advance(slow.game, 2);
  slow.game.pause();
  const paused = slow.game.snapshot();
  advance(slow.game, 10);
  assert.deepEqual(slow.game.snapshot(), paused);
  assert.equal(slow.game.hit('invented'), null);
  slow.game.resume();
  advanceTo(slow.game, 36.01);
  advanceTo(regular.game, 36.01);
  assert.equal(slow.game.state.event, 'rush');
  assert.equal(slow.game.state.worldSpeed, RUSH_WORLD_SPEED);
  const regularCount = regular.spawned.filter((item) => item.at > 31).length;
  assert.ok(slow.spawned.length - beforeCount < regularCount);
  assert.ok(Math.abs(slow.game.state.elapsed - 36.01) < 1e-8);
});

test('les objets expirent en temps monde pour rester découpables pendant le ralentissement', () => {
  const { game, spawned } = arena();
  advanceTo(game, 23.9);
  const ingredients = spawned.filter((item) => !isSpecialKind(item.kind)).slice(-2);
  advanceTo(game, 24.1);
  game.hit(spawned.find((item) => item.kind === 'slow')!.id);
  advanceTo(game, 31.5);
  assert.equal(game.hit(ingredients[0].id), 'good');
  advanceTo(game, 35);
  assert.equal(game.hit(ingredients[1].id), null);
});

test('un ralentissement ne prolonge ni la découpe ni le mélange', () => {
  let lateHourglass = '';
  let game: GameEngine;
  game = new GameEngine(
    RECIPES[0],
    (id, kind) => {
      if (kind === 'slow') lateHourglass = id;
      else if (kind !== 'danger') game.hit(id);
    },
    () => 0.5,
  );
  game.start();
  while (game.state.phase === 'countdown') game.tick(0.05);
  advanceTo(game, 24.1);
  assert.equal(game.hit(lateHourglass), 'slow');
  assert.equal(game.state.event, 'slow');
  advanceTo(game, CUT_SECONDS);
  assert.equal(game.state.elapsed, CUT_SECONDS);
  assert.equal(game.state.phase, 'mixing');
  assert.equal(game.state.remaining, MIX_SECONDS);
  assert.equal(game.state.worldSpeed, 1);
  assert.equal(game.state.event, 'normal');
  advance(game, MIX_SECONDS + 0.1, 1);
  assert.equal(game.state.outcome, 'won');
});

test('les objets spéciaux sont réguliers, bornés et ne remplacent pas les aliments', () => {
  for (const recipe of RECIPES) {
    const { game, spawned } = arena(recipe);
    advanceTo(game, CUT_SECONDS);
    const specials = spawned.filter((item) => isSpecialKind(item.kind));
    assert.deepEqual(
      specials.map(({ kind }) => kind),
      ['shield', 'danger', 'slow', 'shield', 'danger'],
    );
    specials.forEach((item, index) => assert.ok(Math.abs(item.at - (index + 1) * 8) < 0.051));
    assert.ok(spawned.length <= maximumSpawns(CUT_SECONDS, recipe.spawnInterval));
    const shiny = spawned.filter((item) => item.shiny);
    assert.equal(shiny.length, 2);
    assert.ok(Math.abs(shiny[0].at - SHINY_SPAWN_TIMES[0]) < 0.051);
    assert.ok(Math.abs(shiny[1].at - SHINY_SPAWN_TIMES[1]) < 0.051);
    assert.ok(shiny.every((item) => item.target && !isSpecialKind(item.kind)));
    assert.equal(new Set(spawned.map(({ id }) => id)).size, spawned.length);
    const count = spawned.length;
    advance(game, 10);
    assert.equal(spawned.length, count);
  }
});

test('un ingrédient brillant compte une fois puis le focus verse seulement les coupes cadencées à sa fin', () => {
  const { game, spawned } = arena();
  advanceTo(game, 12.1);
  const shiny = spawned.find((item) => item.shiny)!;
  assert.equal(game.hit(shiny.id), 'focus-start');
  assert.equal(game.state.event, 'focus');
  assert.equal(game.state.worldSpeed, 0);
  assert.deepEqual(game.state.focus, {
    id: shiny.id,
    kind: shiny.kind,
    remaining: FOCUS_SECONDS,
    cuts: 0,
    points: 0,
  });
  const started = game.snapshot();
  started.focus!.cuts = 1000;
  assert.equal(game.state.focus!.cuts, 0);
  const baseline = game.state.score;
  const elapsed = game.state.elapsed;
  const count = spawned.length;
  assert.equal(game.hit(shiny.id), null);
  game.tick(0.1);
  assert.equal(game.hit(shiny.id), null);
  game.tick(0.01);
  assert.equal(game.hit(shiny.id), 'focus-cut');
  for (let attempt = 0; attempt < 100; attempt += 1) assert.equal(game.hit(shiny.id), null);
  let cuts = 1;
  while (game.state.focus && game.state.focus.remaining > FOCUS_CUT_INTERVAL) {
    game.tick(0.1);
    game.tick(0.01);
    if (game.hit(shiny.id) === 'focus-cut') cuts += 1;
  }
  assert.equal(game.state.score, baseline);
  assert.equal(game.state.hits, 1);
  assert.equal(
    Object.values(game.state.counts).reduce((sum, value) => sum + value, 0),
    1,
  );
  game.tick(game.state.focus!.remaining);
  assert.equal(game.state.focus, null);
  assert.equal(game.state.elapsed, elapsed);
  assert.equal(spawned.length, count);
  assert.equal(cuts, 27);
  assert.equal(game.state.score, baseline + cuts * FOCUS_POINTS_PER_CUT);
  assert.equal(game.state.feedback, `+${cuts * FOCUS_POINTS_PER_CUT} · ${cuts} coupes !`);
  assert.equal(game.hit(shiny.id), null);
});

test('le focus fige les autres objets, les pouvoirs et le chronomètre, y compris en pause', () => {
  const { game, spawned } = arena();
  advanceTo(game, 31.9);
  assert.equal(game.hit(spawned.find((item) => item.kind === 'slow')!.id), 'slow');
  advanceTo(game, 32.1);
  const shield = spawned.filter((item) => item.kind === 'shield').at(-1)!;
  assert.equal(game.hit(shield.id), 'shield');
  const shiny = spawned.filter((item) => item.shiny).at(-1)!;
  const other = spawned.filter((item) => !isSpecialKind(item.kind) && !item.shiny).at(-1)!;
  const slowRemaining = game.state.eventRemaining;
  assert.equal(game.hit(shiny.id), 'focus-start');
  const elapsed = game.state.elapsed;
  const remaining = game.state.remaining;
  const shieldRemaining = game.state.shieldRemaining;
  const spawns = spawned.length;
  assert.equal(game.hit(other.id), null);
  advance(game, 1);
  game.pause();
  const paused = game.snapshot();
  advance(game, 20);
  assert.deepEqual(game.snapshot(), paused);
  assert.equal(game.hit(shiny.id), null);
  game.resume();
  advance(game, 2);
  assert.equal(game.state.focus, null);
  assert.equal(game.state.elapsed, elapsed);
  assert.equal(game.state.remaining, remaining);
  assert.equal(game.state.shieldRemaining, shieldRemaining);
  assert.equal(game.state.event, 'slow');
  assert.equal(game.state.eventRemaining, slowRemaining);
  assert.equal(spawned.length, spawns);
  assert.equal(game.hit(other.id), 'good');
});

test('les brillants privilégient les ingrédients manquants', () => {
  const recipe = { ...RECIPES[0], goal: 1 };
  let shinyKind = '';
  let game: GameEngine;
  game = new GameEngine(
    recipe,
    (id, kind, target, shiny) => {
      if (shiny) shinyKind = kind;
      else if (target && !isSpecialKind(kind) && kind !== 'tomato') game.hit(id);
    },
    () => 0.26,
  );
  game.start();
  while (game.state.phase === 'countdown') game.tick(0.05);
  advanceTo(game, 12.1);
  assert.equal(game.state.hits, 4);
  assert.equal(shinyKind, 'tomato');
});

test('la frénésie accélère aussi l’expiration des identifiants selon le temps monde', () => {
  const { game, spawned } = arena();
  advanceTo(game, RUSH_WINDOWS[0].start - 0.8);
  const ingredient = spawned.filter((item) => !isSpecialKind(item.kind) && !item.shiny).at(-1)!;
  advanceTo(game, RUSH_WINDOWS[0].start + 5);
  assert.equal(game.hit(ingredient.id), null);
});

test('trois cœurs supplémentaires au maximum soignent sans modifier le score ni remplacer les aliments', () => {
  for (const recipe of RECIPES) {
    const { game, spawned } = arena(recipe, () => 0);
    const control = arena(recipe, () => 0);
    for (const [index, at] of HEART_SPAWN_TIMES.entries()) {
      advanceTo(game, at - 0.1);
      advanceTo(control.game, at - 0.1);
      const trap = spawned.filter((item) => !item.target && item.kind !== 'danger').at(-1)!;
      assert.equal(game.hit(trap.id), 'bad');
      assert.equal(game.state.hearts, MAX_HEARTS - 1);
      advanceTo(game, at + 0.01);
      advanceTo(control.game, at + 0.01);
      const heart = spawned.filter((item) => item.kind === 'heart').at(-1)!;
      assert.ok(Math.abs(heart.at - at) < 0.051);
      assert.equal(heart.target, true);
      assert.equal(heart.shiny, false);
      const before = game.snapshot();
      assert.equal(game.hit(heart.id), 'heal');
      assert.equal(game.state.hearts, MAX_HEARTS);
      assert.equal(game.state.livesRecovered, index + 1);
      assert.equal(game.hit(heart.id), null);
      for (const key of ['score', 'hits', 'combo', 'bestCombo', 'mistakes', 'counts'] as const)
        assert.deepEqual(game.state[key], before[key], key);
    }
    advanceTo(game, CUT_SECONDS);
    advanceTo(control.game, CUT_SECONDS);
    assert.equal(spawned.filter((item) => item.kind === 'heart').length, 3);
    assert.equal(control.spawned.filter((item) => item.kind === 'heart').length, 0);
    assert.deepEqual(
      spawned.filter((item) => item.kind !== 'heart').map(({ kind, at }) => ({ kind, at })),
      control.spawned.map(({ kind, at }) => ({ kind, at })),
    );
    assert.ok(spawned.length <= maximumSpawns(CUT_SECONDS, recipe.spawnInterval, true, true));
    assert.equal(game.state.livesRecovered, 3);
    assert.equal(game.state.hearts, 3);
  }
});

test('un cœur ne rend qu’une vie après une bombe et conserve un combo déjà construit', () => {
  const { game, spawned } = arena();
  advanceTo(game, 16.1);
  assert.equal(game.hit(spawned.find((item) => item.kind === 'danger')!.id), 'danger');
  assert.equal(game.state.hearts, 1);
  advanceTo(game, 17.9);
  const food = spawned.filter((item) => !isSpecialKind(item.kind) && !item.shiny).at(-1)!;
  assert.equal(game.hit(food.id), 'good');
  assert.equal(game.state.combo, 1);
  advanceTo(game, 18.1);
  const before = game.snapshot();
  assert.equal(game.hit(spawned.find((item) => item.kind === 'heart')!.id), 'heal');
  assert.equal(game.state.hearts, 2);
  assert.equal(game.state.livesRecovered, 1);
  for (const key of ['score', 'hits', 'combo', 'bestCombo', 'mistakes', 'counts'] as const)
    assert.deepEqual(game.state[key], before[key], key);
});

test('une occasion à vie pleine est perdue et ne réapparaît pas après un dégât tardif', () => {
  const { game, spawned } = arena(RECIPES[0], () => 0);
  advanceTo(game, 18.1);
  assert.equal(
    spawned.some((item) => item.kind === 'heart'),
    false,
  );
  advanceTo(game, 19);
  assert.equal(
    game.hit(spawned.filter((item) => !item.target && item.kind !== 'danger').at(-1)!.id),
    'bad',
  );
  advanceTo(game, 29.9);
  assert.equal(
    spawned.some((item) => item.kind === 'heart'),
    false,
  );
  advanceTo(game, 30.1);
  assert.equal(spawned.filter((item) => item.kind === 'heart').length, 1);
});

test('un cœur coupé à trois vies est consommé sans récompense ni dépassement du plafond', () => {
  const { game, spawned } = arena(RECIPES[0], () => 0);
  advanceTo(game, 17.9);
  game.hit(spawned.filter((item) => !item.target && item.kind !== 'danger').at(-1)!.id);
  advanceTo(game, 18.1);
  const heart = spawned.find((item) => item.kind === 'heart')!;
  // Defensive branch: the engine must recheck health when the object is cut.
  game.state.hearts = MAX_HEARTS;
  const before = game.snapshot();
  assert.equal(game.hit(heart.id), 'full-health');
  assert.equal(game.hit(heart.id), null);
  assert.equal(game.state.hearts, MAX_HEARTS);
  assert.equal(game.state.livesRecovered, 0);
  for (const key of ['score', 'hits', 'combo', 'bestCombo', 'mistakes', 'counts'] as const)
    assert.deepEqual(game.state[key], before[key], key);
});

test('les occasions de cœur attendent la fin du focus et la pause fige aussi leurs objets', () => {
  const { game, spawned } = arena(RECIPES[0], () => 0);
  advanceTo(game, 15.5);
  game.hit(spawned.filter((item) => !item.target && item.kind !== 'danger').at(-1)!.id);
  assert.equal(game.hit(spawned.find((item) => item.shiny)!.id), 'focus-start');
  advance(game, 1);
  game.pause();
  const paused = game.snapshot();
  advance(game, 20);
  assert.deepEqual(game.snapshot(), paused);
  game.resume();
  advance(game, 2);
  assert.equal(game.state.elapsed, 15.5);
  assert.equal(
    spawned.some((item) => item.kind === 'heart'),
    false,
  );
  advanceTo(game, 18.1);
  const first = spawned.find((item) => item.kind === 'heart')!;
  assert.equal(game.hit(first.id), 'heal');
  advanceTo(game, 29.9);
  game.hit(spawned.filter((item) => !item.target && item.kind !== 'danger').at(-1)!.id);
  advanceTo(game, 30.1);
  const second = spawned.filter((item) => item.kind === 'heart').at(-1)!;
  game.pause();
  assert.equal(game.hit(second.id), null);
  const awaitingHeart = game.snapshot();
  advance(game, 20);
  assert.deepEqual(game.snapshot(), awaitingHeart);
  game.resume();
  advanceTo(game, 31);
  assert.equal(game.hit(spawned.filter((item) => item.shiny).at(-1)!.id), 'focus-start');
  assert.equal(game.hit(second.id), null);
  advance(game, 3);
  assert.equal(game.hit(second.id), 'heal');
  assert.equal(game.state.livesRecovered, 2);
  assert.equal(game.state.hearts, 3);
});

test('un cœur manqué expire normalement et ne soigne pas après sa disparition', () => {
  const { game, spawned } = arena(RECIPES[0], () => 0);
  advanceTo(game, 17.9);
  game.hit(spawned.filter((item) => !item.target && item.kind !== 'danger').at(-1)!.id);
  advanceTo(game, 18.1);
  const heart = spawned.find((item) => item.kind === 'heart')!;
  advanceTo(game, 27);
  assert.equal(game.hit(heart.id), null);
  assert.equal(game.state.hearts, 2);
  assert.equal(game.state.livesRecovered, 0);
});

test('une partie complète dure 54 secondes, ou 60 avec les deux défis, sur chaque recette', () => {
  for (const recipe of RECIPES) {
    for (const cutRares of [false, true]) {
      let game: GameEngine;
      let focuses = 0;
      game = new GameEngine(
        recipe,
        (id, kind, target, shiny) => {
          if (!target || isSpecialKind(kind) || (shiny && !cutRares)) return;
          if (game.hit(id) === 'focus-start') focuses += 1;
        },
        () => 0.5,
      );
      game.start();
      let elapsed = 0;
      while (game.state.phase !== 'result' && elapsed < 61) {
        game.tick(0.05, 1);
        elapsed += 0.05;
      }
      assert.equal(game.state.outcome, 'won', recipe.id);
      assert.equal(focuses, cutRares ? 2 : 0);
      const expected = COUNTDOWN_SECONDS + CUT_SECONDS + MIX_SECONDS + focuses * FOCUS_SECONDS;
      assert.ok(Math.abs(elapsed - expected) <= 0.15, `${recipe.id}: ${elapsed} s / ${expected}`);
      assert.equal(game.state.elapsed, CUT_SECONDS);
    }
  }
});

test('le mélange de six secondes garde le même effort moyen requis et le bonus plafonné', () => {
  for (const [energy, outcome] of [
    [0.174, 'mix'],
    [0.18, 'won'],
    [1, 'won'],
  ] as const) {
    let game: GameEngine;
    game = new GameEngine(
      RECIPES[0],
      (id, kind, target, shiny) => {
        if (target && !shiny && !isSpecialKind(kind)) game.hit(id);
      },
      () => 0.5,
    );
    game.start();
    while (game.state.phase === 'countdown' || game.state.phase === 'playing') game.tick(0.05);
    assert.equal(game.state.phase, 'mixing');
    const score = game.state.score;
    advance(game, MIX_SECONDS + 0.1, energy);
    assert.equal(game.state.outcome, outcome);
    assert.ok(game.state.mix <= 1);
    assert.equal(
      game.state.score - score,
      outcome === 'won' ? Math.round(game.state.mix * 500) : 0,
    );
  }
});

test('les quotas courts restent atteignables avec des pièges et un bon ingrédient manqué sur cinq', () => {
  for (const recipe of RECIPES) {
    let seed = 42;
    const random = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32;
    let seen = 0;
    let game: GameEngine;
    game = new GameEngine(
      recipe,
      (id, kind, target, shiny) => {
        if (!target || shiny || isSpecialKind(kind)) return;
        seen += 1;
        if (seen % 5 !== 0) game.hit(id);
      },
      random,
    );
    game.start();
    advance(game, 54.2, 1);
    assert.equal(game.state.outcome, 'won', `${recipe.id}, ${seen} bons ingrédients proposés`);
    for (const kind of recipe.ingredients) assert.ok(game.state.counts[kind]! >= recipe.goal);
  }
});
