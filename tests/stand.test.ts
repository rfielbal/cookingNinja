import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import express from 'express';
import { createStandRouter } from '../server/stand-api.js';
import { StandStore } from '../server/stand-store.js';
import {
  parseRunStart,
  parseRunResult,
  parseLeaderboardQuery,
  RULES_VERSION,
  validateResult,
  type StandRun,
} from '../server/stand-domain.js';
import { FOCUS_MAX_BONUS, HEART_SPAWN_TIMES, maximumSpawns } from '../src/game/events.js';
import { COUNTDOWN_SECONDS, CUT_SECONDS, MIX_SECONDS, GameEngine } from '../src/game/engine.js';
import { RECIPES } from '../src/game/recipes.js';
import { getLeaderboard } from '../src/stand.js';

const start = { nickname: 'Ninja-1234', recipeId: 'burger', mode: 'motion' } as const;
const won = { score: 4_950, outcome: 'won', hits: 25, mistakes: 0, bestCombo: 25 } as const;
const lost = { score: 0, outcome: 'hearts', hits: 0, mistakes: 3, bestCombo: 0 } as const;

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'cookingninja-stand-test-'));
  let now = Date.parse('2026-10-12T08:00:00Z');
  const clock = () => now;
  const store = await StandStore.open(directory, clock);
  const app = express();
  app.use('/api', createStandRouter(store));
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  t.after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await store.close();
    await rm(directory, { recursive: true, force: true });
  });
  async function request(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const response = await fetch(`${origin}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Origin: origin, ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json(), response };
  }
  return {
    directory,
    store,
    request,
    origin,
    clock,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

test('le classement persiste les victoires et reste idempotent après redémarrage', async (t) => {
  const { request, advance, directory, clock, store } = await fixture(t);
  const created = await request('POST', '/runs', start);
  assert.equal(created.status, 201);
  assert.deepEqual(Object.keys(created.body), ['id']);
  advance(91_000);
  const finished = await request('POST', `/runs/${created.body.id}/finish`, won);
  assert.equal(finished.status, 200);
  assert.equal((await request('POST', `/runs/${created.body.id}/finish`, won)).status, 200);
  assert.equal(
    (await request('PATCH', `/runs/${created.body.id}/finish`, { ...won, score: 4_900 })).status,
    409,
  );
  const ranking = await request('GET', '/leaderboard?recipeId=burger&mode=motion');
  assert.equal(ranking.body.entries.length, 1);
  assert.equal(ranking.body.entries[0].nickname, start.nickname);
  assert.equal(ranking.body.entries[0].score, won.score);
  assert.equal(ranking.body.entries[0].outcome, 'won');
  await store.close();
  const reopened = await StandStore.open(directory, clock);
  assert.equal((await reopened.leaderboard('burger', 'motion')).length, 1);
  await reopened.close();
  assert.equal((await stat(join(directory, 'stand.json'))).mode & 0o777, 0o600);
  assert.deepEqual(await readdir(directory), ['stand.json']);
});

test('les pertes sont persistées sans entrer au classement et les catégories sont séparées', async (t) => {
  const { request, advance } = await fixture(t);
  const motion = await request('POST', '/runs', start);
  const mouse = await request('POST', '/runs', { ...start, mode: 'mouse', nickname: 'Souris' });
  advance(91_000);
  assert.equal((await request('POST', `/runs/${motion.body.id}/finish`, lost)).status, 200);
  assert.equal((await request('POST', `/runs/${mouse.body.id}/finish`, won)).status, 200);
  assert.equal((await request('GET', '/leaderboard?mode=motion')).body.entries.length, 0);
  assert.equal((await request('GET', '/leaderboard?mode=mouse')).body.entries.length, 1);
  assert.equal((await request('POST', `/runs/${motion.body.id}/finish`, lost)).status, 200);
});

test('un proxy loopback avec Host public ou Origin distant ne peut pas écrire', async (t) => {
  const { request } = await fixture(t);
  const publicOrigin = 'https://stand.trycloudflare.com';
  assert.equal(
    (
      await request('POST', '/runs', start, {
        Host: 'stand.trycloudflare.com',
        Origin: publicOrigin,
      })
    ).status,
    403,
  );
  assert.equal((await request('POST', '/runs', start, { Origin: publicOrigin })).status, 403);
  assert.equal((await request('POST', '/runs', start, { Origin: '' })).status, 403);
  assert.equal(
    (
      await request('POST', '/runs', start, {
        Host: 'localhost.evil.test',
        Origin: 'http://localhost.evil.test',
      })
    ).status,
    403,
  );
  const publicRead = await request('GET', '/leaderboard', undefined, {
    Host: 'stand.trycloudflare.com',
    Origin: publicOrigin,
  });
  assert.equal(publicRead.status, 200);
  assert.equal((await request('POST', '/runs', start)).status, 201);
});

test('les pseudos et résultats impossibles sont refusés sans casser les écritures suivantes', async (t) => {
  const { request, advance } = await fixture(t);
  assert.equal(
    (await request('POST', '/runs', { ...start, nickname: '<script>alert(1)</script>' })).status,
    400,
  );
  assert.equal((await request('POST', '/runs', { ...start, nickname: 'A' })).status, 400);
  assert.equal(
    (await request('POST', '/runs', { ...start, nickname: 'a'.repeat(21) })).status,
    400,
  );
  assert.equal((await request('POST', '/runs', { ...start, recipeId: 'unknown' })).status, 400);
  assert.equal((await request('POST', '/runs', { ...start, junk: 'a'.repeat(3_000) })).status, 413);
  assert.equal(parseRunStart({ ...start, nickname: '  Éloïse   Ninja ' }).nickname, 'Éloïse Ninja');
  const created = await request('POST', '/runs', start);
  assert.equal((await request('POST', `/runs/${created.body.id}/finish`, won)).status, 422);
  advance(91_000);
  assert.equal(
    (await request('POST', `/runs/${created.body.id}/finish`, { ...won, score: 40_000 })).status,
    422,
  );
  assert.equal(
    (await request('POST', `/runs/${created.body.id}/finish`, { ...won, bestCombo: 30 })).status,
    422,
  );
  assert.equal((await request('POST', `/runs/${created.body.id}/finish`, won)).status, 200);
});

test('la queue conserve toutes les écritures simultanées et un seul résultat par run', async (t) => {
  const { store, advance, directory } = await fixture(t);
  const created = await Promise.all(
    Array.from({ length: 25 }, (_, index) =>
      store.create({ ...start, nickname: `Ninja-${index}` }),
    ),
  );
  advance(91_000);
  await Promise.all(created.map(({ id }) => store.finish(id, won)));
  await Promise.all(Array.from({ length: 5 }, () => store.finish(created[0]!.id, won)));
  assert.equal((await store.leaderboard(undefined, undefined, 100)).length, 25);
  const file = JSON.parse(await readFile(join(directory, 'stand.json'), 'utf8'));
  assert.equal(file.runs.length, 25);
  assert.equal(new Set(file.runs.map((run: { id: string }) => run.id)).size, 25);
});

test('un fichier corrompu est conservé et bloque l’ouverture au lieu d’effacer les données', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'cookingninja-corrupt-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'stand.json');
  await writeFile(path, '{not-valid-json', { mode: 0o600 });
  await assert.rejects(StandStore.open(directory), /conservé/);
  assert.equal(await readFile(path, 'utf8'), '{not-valid-json');
});

test('la configuration et le classement ne contiennent aucune API de contact', async (t) => {
  const { request } = await fixture(t);
  assert.deepEqual((await request('GET', '/stand/config')).body, { rulesVersion: RULES_VERSION });
  assert.deepEqual(Object.keys((await request('GET', '/leaderboard')).body).sort(), [
    'entries',
    'highlight',
    'rulesVersion',
    'scope',
    'total',
  ]);
  assert.equal((await request('GET', '/leaderboard?recipeId=nope')).status, 400);
  assert.equal((await request('GET', '/leaderboard?limit=1000')).status, 400);
});

test('un deuxième serveur ne peut pas écraser le classement du premier', async (t) => {
  const { store, directory } = await fixture(t);
  await store.create(start);
  await assert.rejects(StandStore.open(directory), /déjà verrouillé/);
  assert.equal(JSON.parse(await readFile(join(directory, 'stand.json'), 'utf8')).runs.length, 1);
  await store.close();
  await assert.rejects(store.create(start), /fermé/);
  const next = await StandStore.open(directory);
  await next.create({ ...start, nickname: 'Suivant' });
  await next.close();
  assert.equal(JSON.parse(await readFile(join(directory, 'stand.json'), 'utf8')).runs.length, 2);
});

test('un verrou laissé après incident exige une vérification manuelle sans effacer les scores', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'cookingninja-lock-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'stand.lock'), JSON.stringify({ pid: 123, token: 'old' }));
  await assert.rejects(StandStore.open(directory), /arrêt brutal/);
  assert.equal(JSON.parse(await readFile(join(directory, 'stand.lock'), 'utf8')).token, 'old');
});

const rulesRun: StandRun = {
  ...start,
  id: '00000000-0000-4000-8000-000000000001',
  rulesVersion: RULES_VERSION,
  createdAt: '2026-10-20T08:00:00.000Z',
};
const finishedAt = Date.parse(rulesRun.createdAt) + 91_000;

test('règles événements : score sans multiplicateur, deux focus et bombes respectent les bornes', () => {
  const focused = { ...won, score: won.hits * 200 + 2 * FOCUS_MAX_BONUS + 500 };
  assert.doesNotThrow(() => validateResult(rulesRun, focused, finishedAt));
  assert.throws(() =>
    validateResult(rulesRun, { ...focused, score: focused.score + 1 }, finishedAt),
  );
  assert.doesNotThrow(() => validateResult(rulesRun, { ...lost, mistakes: 2 }, finishedAt));
  assert.throws(() => validateResult(rulesRun, { ...lost, mistakes: 1 }, finishedAt));
  const max = maximumSpawns(CUT_SECONDS, RECIPES[0].spawnInterval);
  assert.throws(() =>
    validateResult(
      rulesRun,
      {
        score: (max + 1) * 100,
        hits: max + 1,
        bestCombo: max + 1,
        mistakes: 0,
        outcome: 'ingredients',
      },
      finishedAt,
    ),
  );
  assert.throws(() => validateResult(rulesRun, { ...won, mistakes: 6 }, finishedAt));
  assert.throws(() => validateResult(rulesRun, { ...lost, score: 50 }, finishedAt));
  const oneHit = {
    score: 200 + FOCUS_MAX_BONUS,
    hits: 1,
    bestCombo: 1,
    mistakes: 2,
    outcome: 'hearts',
  } as const;
  assert.doesNotThrow(() => validateResult(rulesRun, oneHit, finishedAt));
  assert.throws(() => validateResult(rulesRun, { ...oneHit, score: oneHit.score + 1 }, finishedAt));
  assert.doesNotThrow(() =>
    validateResult(
      rulesRun,
      { hits: 0, mistakes: 0, score: 0, bestCombo: 0, outcome: 'ingredients' },
      finishedAt,
    ),
  );
});

test('règles historiques : les anciennes parties gardent leurs limites de score et trois erreurs', () => {
  const legacy = { ...rulesRun, rulesVersion: 'stand-v0.2' };
  assert.doesNotThrow(() => validateResult(legacy, won, finishedAt));
  assert.doesNotThrow(() => validateResult(legacy, lost, finishedAt));
  assert.throws(() => validateResult(legacy, { ...won, score: 10_000 }, finishedAt));
  assert.throws(() => validateResult(legacy, { ...lost, mistakes: 2 }, finishedAt));
  const previousEvents = { ...rulesRun, rulesVersion: 'stand-v0.3-events' };
  const doubled = { ...won, score: won.hits * 400 + 500 };
  assert.doesNotThrow(() => validateResult(previousEvents, doubled, finishedAt));
  assert.doesNotThrow(() => validateResult(previousEvents, { ...lost, mistakes: 2 }, finishedAt));
  assert.throws(() =>
    validateResult(previousEvents, { ...doubled, score: doubled.score + 1 }, finishedAt),
  );
  const oldMax = Math.ceil(90 / 1.1) + 1 + 9;
  assert.throws(() =>
    validateResult(
      previousEvents,
      {
        score: 100 * (oldMax + 1),
        hits: oldMax + 1,
        bestCombo: oldMax + 1,
        mistakes: 0,
        outcome: 'ingredients',
      },
      finishedAt,
    ),
  );
  const previousFrenzy = { ...rulesRun, rulesVersion: 'stand-v0.4-frenzy' };
  const focused = { ...won, score: won.hits * 200 + 2 * FOCUS_MAX_BONUS + 500 };
  assert.doesNotThrow(() => validateResult(previousFrenzy, focused, finishedAt));
  assert.throws(() =>
    validateResult(previousFrenzy, { ...focused, score: focused.score + 1 }, finishedAt),
  );
  for (const old of [legacy, previousEvents, previousFrenzy]) {
    assert.throws(() => validateResult(old, { ...lost, mistakes: 4 }, finishedAt));
    assert.throws(() => validateResult(old, { ...won, mistakes: 3 }, finishedAt));
    assert.throws(() => validateResult(old, { ...won, mistakes: 5 }, finishedAt));
  }
});

test('règles cœurs : six erreurs au maximum après soins, cinq si la partie reste vivante', () => {
  assert.equal(RULES_VERSION, 'stand-v0.6-minute');
  for (const mistakes of [2, 3, 4, 5, 6]) {
    const result = parseRunResult({ ...lost, mistakes });
    assert.doesNotThrow(() => validateResult(rulesRun, result, finishedAt));
  }
  const alive = { hits: 0, mistakes: 5, score: 0, bestCombo: 0, outcome: 'ingredients' } as const;
  assert.doesNotThrow(() => validateResult(rulesRun, alive, finishedAt));
  assert.doesNotThrow(() => validateResult(rulesRun, { ...won, mistakes: 5 }, finishedAt));
  assert.throws(() => validateResult(rulesRun, { ...alive, mistakes: 6 }, finishedAt));
  assert.throws(() => validateResult(rulesRun, { ...lost, mistakes: 7 }, finishedAt));
  for (const mistakes of [-1, 6.5, 7]) {
    assert.throws(() => parseRunResult({ ...lost, mistakes }));
  }
  // Healing does not create an extra scoring allowance or a new client result field.
  assert.throws(() => validateResult(rulesRun, { ...lost, mistakes: 6, score: 1 }, finishedAt));
  assert.deepEqual(parseRunResult({ ...lost, livesRecovered: 3 }), lost);
});

test('règles cœurs : les erreurs supplémentaires exigent des occasions de soin déjà écoulées', () => {
  for (const [index, at] of HEART_SPAWN_TIMES.entries()) {
    const result = { ...lost, mistakes: 4 + index };
    const earliest = Date.parse(rulesRun.createdAt) + (3 + at) * 1_000;
    assert.throws(() => validateResult(rulesRun, result, earliest - 1));
    assert.doesNotThrow(() => validateResult(rulesRun, result, earliest));
  }
});

test('règles cœurs : une partie réelle récupère trois vies puis perd à la sixième erreur', async (t) => {
  let trap = '';
  let game: GameEngine;
  game = new GameEngine(
    RECIPES[0],
    (id, kind, target) => {
      if (kind === 'heart') assert.equal(game.hit(id), 'heal');
      else if (!target && kind !== 'danger') trap = id;
    },
    () => 0,
  );
  game.start();
  while (game.state.phase === 'countdown') game.tick(0.05);
  for (const at of HEART_SPAWN_TIMES) {
    while (game.state.elapsed < at - 0.1) game.tick(0.05);
    assert.equal(game.hit(trap), 'bad');
    while (game.state.elapsed < at + 0.1) game.tick(0.05);
    assert.equal(game.state.hearts, 3);
  }
  assert.equal(game.state.livesRecovered, 3);
  const recovered = game.snapshot();
  while (game.state.phase === 'playing') {
    game.tick(0.05);
    if (game.hit(trap) === 'bad') trap = '';
  }
  assert.equal(game.state.outcome, 'hearts');
  assert.equal(game.state.mistakes, 6);
  assert.equal(game.state.hearts, 0);
  assert.equal(game.state.livesRecovered, 3);
  assert.equal(game.state.score, recovered.score);
  assert.equal(game.state.hits, recovered.hits);
  const result = parseRunResult(game.snapshot());
  assert.doesNotThrow(() => validateResult(rulesRun, result, finishedAt));
  const directory = await mkdtemp(join(tmpdir(), 'cookingninja-hearts-test-'));
  let now = Date.parse(rulesRun.createdAt);
  let store = await StandStore.open(directory, () => now);
  t.after(async () => {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  });
  const created = await store.create(start);
  now = finishedAt;
  await store.finish(created.id, result);
  await store.close();
  store = await StandStore.open(directory, () => now);
  await assert.doesNotReject(store.finish(created.id, result));
  assert.equal((await store.leaderboard()).length, 0);
  const stored = JSON.parse(await readFile(join(directory, 'stand.json'), 'utf8'));
  assert.equal(stored.runs[0].result.mistakes, 6);
  assert.equal(stored.runs[0].rulesVersion, RULES_VERSION);
});

test('règles événements : les victoires réellement calculées par les trois recettes sont acceptées', () => {
  for (const recipe of RECIPES) {
    let game: GameEngine;
    game = new GameEngine(
      recipe,
      (id, kind) => kind !== 'danger' && game.hit(id),
      () => 0.5,
    );
    game.start();
    let elapsed = 0;
    for (let step = 0; step < 1210 && game.state.phase !== 'result'; step += 1) {
      game.tick(0.05, 1);
      elapsed += 0.05;
      if (game.state.focus) game.hit(game.state.focus.id);
    }
    assert.equal(game.state.outcome, 'won');
    assert.ok(elapsed >= 60 && elapsed <= 60.2, `${recipe.id}: ${elapsed} s`);
    assert.doesNotThrow(() =>
      validateResult(
        { ...rulesRun, recipeId: recipe.id },
        parseRunResult(game.snapshot()),
        Date.parse(rulesRun.createdAt) + Math.round(elapsed * 1_000),
      ),
    );
  }
});

test('règles classement : les anciens records restent stockés sans rejoindre la nouvelle catégorie', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'cookingninja-rules-test-'));
  let now = Date.parse(rulesRun.createdAt);
  let store = await StandStore.open(directory, () => now);
  t.after(async () => {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  });
  const old = await store.create(start);
  now += 91_000;
  await store.finish(old.id, won);
  await store.close();
  const path = join(directory, 'stand.json');
  const data = JSON.parse(await readFile(path, 'utf8'));
  data.runs[0].rulesVersion = 'stand-v0.2';
  data.runs.push({
    ...data.runs[0],
    id: '00000000-0000-4000-8000-000000000002',
    rulesVersion: 'stand-v0.3-events',
  });
  data.runs.push({
    ...data.runs[0],
    id: '00000000-0000-4000-8000-000000000003',
    rulesVersion: 'stand-v0.4-frenzy',
  });
  data.runs.push({
    ...data.runs[0],
    id: '00000000-0000-4000-8000-000000000004',
    rulesVersion: 'stand-v0.5-hearts',
  });
  await writeFile(path, JSON.stringify(data), { mode: 0o600 });
  store = await StandStore.open(directory, () => now);
  assert.equal((await store.leaderboard()).length, 0);
  const current = await store.create(start);
  now += 91_000;
  await store.finish(current.id, won);
  const ranking = await store.leaderboard();
  assert.equal(ranking.length, 1);
  assert.equal(ranking[0].rulesVersion, RULES_VERSION);
  assert.equal(JSON.parse(await readFile(path, 'utf8')).runs.length, 5);
  const unchanged = await readFile(path, 'utf8');
  const allTime = await store.leaderboardPage({ scope: 'all-time' });
  assert.equal(allTime.total, 5);
  assert.equal(allTime.entries.length, 5);
  assert.deepEqual(
    new Set(allTime.entries.map((entry) => entry.rulesVersion)),
    new Set([
      'stand-v0.2',
      'stand-v0.3-events',
      'stand-v0.4-frenzy',
      'stand-v0.5-hearts',
      RULES_VERSION,
    ]),
  );
  assert.equal(await readFile(path, 'utf8'), unchanged);
});

test('classement agrégé : meilleures parties toutes recettes et commandes, rang hors top et départage stable', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'cookingninja-aggregate-test-'));
  const base = Date.parse('2026-10-20T08:00:00.000Z');
  let now = base;
  const store = await StandStore.open(directory, () => now);
  t.after(async () => {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  });
  const definitions = [
    { nickname: 'Sam', recipeId: 'burger', mode: 'motion', score: 7_000, combo: 35, delay: 0 },
    { nickname: 'Sam', recipeId: 'tacos', mode: 'touch', score: 6_800, combo: 36, delay: 0 },
    { nickname: 'Choco', recipeId: 'cake', mode: 'mouse', score: 7_100, combo: 34, delay: 0 },
    { nickname: 'Combo', recipeId: 'burger', mode: 'touch', score: 7_000, combo: 30, delay: 0 },
    { nickname: 'Après', recipeId: 'tacos', mode: 'mouse', score: 7_000, combo: 35, delay: 1_000 },
    { nickname: 'Égal', recipeId: 'burger', mode: 'motion', score: 7_000, combo: 35, delay: 0 },
  ] as const;
  const runs = await Promise.all(
    definitions.map(({ nickname, recipeId, mode }) => store.create({ nickname, recipeId, mode })),
  );
  const lostRun = await store.create({ ...start, nickname: 'Perdu' });
  const pendingRun = await store.create({ ...start, nickname: 'En cours' });
  for (const [index, definition] of definitions.entries()) {
    now = base + 91_000 + definition.delay;
    await store.finish(runs[index].id, {
      outcome: 'won',
      score: definition.score,
      hits: 40,
      mistakes: 0,
      bestCombo: definition.combo,
    });
  }
  await store.finish(lostRun.id, { ...lost, score: 7_500, hits: 40, bestCombo: 40 });
  const fileBefore = await readFile(store.path, 'utf8');
  const equalIds = [runs[0].id, runs[5].id].sort();
  const all = await store.leaderboardPage({ scope: 'all-time' });
  assert.deepEqual(
    all.entries.map((entry) => entry.id),
    [runs[2].id, ...equalIds, runs[4].id, runs[3].id, runs[1].id],
  );
  assert.deepEqual(
    all.entries.map((entry) => entry.rank),
    [1, 2, 3, 4, 5, 6],
  );
  assert.equal(all.total, 6);
  assert.equal(all.entries.filter((entry) => entry.nickname === 'Sam').length, 2);
  assert.deepEqual(
    new Set(all.entries.map((entry) => entry.mode)),
    new Set(['motion', 'touch', 'mouse']),
  );
  assert.equal(all.entries[0].score, 7_100);
  const limited = await store.leaderboardPage({
    scope: 'all-time',
    limit: 2,
    highlightEntryId: runs[1].id,
  });
  assert.equal(limited.entries.length, 2);
  assert.equal(limited.total, 6);
  assert.equal(limited.highlight?.entry.id, runs[1].id);
  assert.equal(limited.highlight?.rank, 6);
  assert.equal(limited.highlight?.entry.rank, 6);
  const tacos = await store.leaderboardPage({
    scope: 'all-time',
    recipeId: 'tacos',
    highlightEntryId: runs[1].id,
  });
  assert.equal(tacos.total, 2);
  assert.equal(tacos.highlight?.rank, 2);
  assert.ok(tacos.entries.every((entry) => entry.recipeId === 'tacos'));
  const touch = await store.leaderboardPage({ scope: 'all-time', mode: 'touch' });
  assert.deepEqual(
    touch.entries.map((entry) => entry.id),
    [runs[3].id, runs[1].id],
  );
  for (const highlightEntryId of [
    lostRun.id,
    pendingRun.id,
    '00000000-0000-4000-8000-000000000099',
  ]) {
    assert.equal(
      (await store.leaderboardPage({ scope: 'all-time', highlightEntryId })).highlight,
      null,
    );
  }
  assert.equal(
    (
      await store.leaderboardPage({
        scope: 'all-time',
        recipeId: 'burger',
        highlightEntryId: runs[1].id,
      })
    ).highlight,
    null,
  );
  assert.equal(await readFile(store.path, 'utf8'), fileBefore);
});

test('classement agrégé : paramètres API bornés et ancien périmètre conservé par défaut', () => {
  const defaultQuery = parseLeaderboardQuery({});
  assert.equal(defaultQuery.scope, 'current-rules');
  assert.equal(defaultQuery.limit, 20);
  assert.equal(defaultQuery.mode, undefined);
  assert.equal(defaultQuery.recipeId, undefined);
  const id = '00000000-0000-4000-8000-000000000001';
  assert.deepEqual(
    parseLeaderboardQuery({
      recipeId: 'cake',
      mode: 'mouse',
      scope: 'all-time',
      limit: '5',
      highlightEntryId: id,
    }),
    {
      recipeId: 'cake',
      mode: 'mouse',
      scope: 'all-time',
      limit: 5,
      highlightEntryId: id,
    },
  );
  for (const query of [
    { recipeId: 'all' },
    { recipeId: ['burger', 'cake'] },
    { mode: 'all' },
    { scope: 'unknown' },
    { scope: ['all-time', 'current-rules'] },
    { limit: '0' },
    { limit: '101' },
    { limit: '1.5' },
    { limit: ['20'] },
    { highlightEntryId: '../runs' },
    { highlightEntryId: [id] },
  ])
    assert.throws(() => parseLeaderboardQuery(query));
});

test('classement agrégé : le client demande explicitement all-time sans filtre de commande', async (t) => {
  const urls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    urls.push(String(input));
    return new Response(
      JSON.stringify({
        entries: [],
        total: 0,
        highlight: null,
        scope: 'all-time',
        rulesVersion: RULES_VERSION,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  });
  const id = '00000000-0000-4000-8000-000000000001';
  const general = await getLeaderboard();
  await getLeaderboard('tacos', id);
  assert.equal(general.scope, 'all-time');
  assert.equal(general.total, 0);
  const all = new URL(urls[0], 'http://localhost');
  assert.equal(all.searchParams.get('scope'), 'all-time');
  assert.equal(all.searchParams.has('recipeId'), false);
  assert.equal(all.searchParams.has('mode'), false);
  const recipe = new URL(urls[1], 'http://localhost');
  assert.equal(recipe.searchParams.get('recipeId'), 'tacos');
  assert.equal(recipe.searchParams.get('highlightEntryId'), id);
  assert.equal(recipe.searchParams.has('mode'), false);
});

test('classement HTTP agrégé : métadonnées, modes réunis et identification hors top', async (t) => {
  const { request, advance } = await fixture(t);
  const first = await request('POST', '/runs', start);
  const second = await request('POST', '/runs', { ...start, nickname: 'Tactile', mode: 'touch' });
  advance(91_000);
  await request('POST', `/runs/${first.body.id}/finish`, won);
  await request('POST', `/runs/${second.body.id}/finish`, { ...won, score: won.score + 100 });
  const result = await request(
    'GET',
    `/leaderboard?scope=all-time&limit=1&highlightEntryId=${first.body.id}`,
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.scope, 'all-time');
  assert.equal(result.body.total, 2);
  assert.equal(result.body.entries[0].id, second.body.id);
  assert.equal(result.body.entries[0].rank, 1);
  assert.equal(result.body.highlight.entry.id, first.body.id);
  assert.equal(result.body.highlight.rank, 2);
  assert.equal((await request('GET', '/leaderboard')).body.scope, 'current-rules');
  assert.equal((await request('GET', '/leaderboard?scope=nope')).status, 400);
  assert.equal((await request('GET', '/leaderboard?highlightEntryId=nope')).status, 400);
});

test('les règles minute appliquent leurs propres durées et quotas sans réinterpréter les anciennes parties', () => {
  const createdAt = Date.parse(rulesRun.createdAt);
  const oldVersions = ['stand-v0.2', 'stand-v0.3-events', 'stand-v0.4-frenzy', 'stand-v0.5-hearts'];
  for (const recipe of RECIPES) {
    const hits = recipe.goal * recipe.ingredients.length;
    const result = { ...won, hits, bestCombo: hits, score: hits * 100 + 175 };
    const current = { ...rulesRun, recipeId: recipe.id };
    const currentMinimum = (CUT_SECONDS + MIX_SECONDS + 1) * 1_000;
    assert.throws(() => validateResult(current, result, createdAt + currentMinimum - 1));
    assert.doesNotThrow(() => validateResult(current, result, createdAt + currentMinimum));
    assert.throws(() =>
      validateResult(current, { ...result, hits: hits - 1, bestCombo: hits - 1 }, finishedAt),
    );
    for (const rulesVersion of oldVersions) {
      const old = { ...current, rulesVersion };
      assert.throws(() => validateResult(old, result, finishedAt), `${rulesVersion}: ancien quota`);
      const oldHits = { burger: 25, tacos: 30, cake: 32 }[recipe.id];
      const oldResult = { ...won, hits: oldHits, bestCombo: oldHits, score: oldHits * 100 + 175 };
      assert.throws(
        () => validateResult(old, oldResult, createdAt + 88_999),
        `${rulesVersion}: ancienne durée`,
      );
      assert.doesNotThrow(() => validateResult(old, oldResult, createdAt + 89_000));
    }
  }
});

test('les records cœurs historiques conservent le calendrier des soins et le nombre maximal d’objets', () => {
  const historical = { ...rulesRun, rulesVersion: 'stand-v0.5-hearts' };
  const createdAt = Date.parse(rulesRun.createdAt);
  const sixthMistake = { ...lost, mistakes: 6 };
  const newThirdHeart = (COUNTDOWN_SECONDS + HEART_SPAWN_TIMES[2]) * 1_000;
  assert.doesNotThrow(() => validateResult(rulesRun, sixthMistake, createdAt + newThirdHeart));
  assert.throws(() => validateResult(historical, sixthMistake, createdAt + newThirdHeart));
  assert.throws(() => validateResult(historical, sixthMistake, createdAt + 64_999));
  assert.doesNotThrow(() => validateResult(historical, sixthMistake, createdAt + 65_000));
  const oldMax = Math.ceil(90 / 1.1) + 1 + 9 + 2;
  const result = {
    score: oldMax * 100,
    hits: oldMax,
    bestCombo: oldMax,
    mistakes: 0,
    outcome: 'ingredients',
  } as const;
  assert.doesNotThrow(() => validateResult(historical, result, finishedAt));
  assert.throws(() => validateResult(rulesRun, result, finishedAt));
  assert.throws(() =>
    validateResult(
      historical,
      { ...result, hits: oldMax + 1, bestCombo: oldMax + 1, score: (oldMax + 1) * 100 },
      finishedAt,
    ),
  );
});
