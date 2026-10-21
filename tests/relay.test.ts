import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { WebSocket } from 'ws';
import { createRelay } from '../server/relay.js';
import type { ServerMessage } from '../shared/protocol.js';

class Inbox {
  messages: ServerMessage[] = [];
  private wake?: () => void;
  constructor(readonly socket: WebSocket) {
    socket.on('message', (data) => {
      this.messages.push(JSON.parse(data.toString()) as ServerMessage);
      this.wake?.();
    });
  }
  send(message: unknown) {
    this.socket.send(JSON.stringify(message));
  }
  async take(
    type: ServerMessage['type'],
    predicate: (message: ServerMessage) => boolean = () => true,
  ): Promise<ServerMessage> {
    const deadline = Date.now() + 1_500;
    while (Date.now() < deadline) {
      const index = this.messages.findIndex(
        (message) => message.type === type && predicate(message),
      );
      if (index !== -1) return this.messages.splice(index, 1)[0]!;
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, Math.max(1, deadline - Date.now()));
        this.wake = () => {
          clearTimeout(timeout);
          resolve();
        };
      });
      this.wake = undefined;
    }
    throw new Error(`Message ${type} absent; reçu : ${JSON.stringify(this.messages)}`);
  }
}

async function fixture(
  t: TestContext,
  options: {
    heartbeatMs?: number;
    unpairedTimeoutMs?: number;
    allowOtherUpgrades?: boolean;
    extraOrigins?: string[];
    controllerGraceMs?: number;
  } = {},
) {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${port}`;
  const url = `ws://127.0.0.1:${port}/relay`;
  const { extraOrigins = [], ...relayOptions } = options;
  const relay = createRelay({ server, allowedOrigins: [origin, ...extraOrigins], ...relayOptions });
  t.after(async () => {
    await relay.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  async function connect() {
    const socket = new WebSocket(url, { origin });
    const inbox = new Inbox(socket);
    await once(socket, 'open');
    return inbox;
  }
  async function pair() {
    const host = await connect();
    host.send({ type: 'host:create' });
    const created = await host.take('room:created');
    assert.equal(created.type, 'room:created');
    const code = (created as { code: string }).code;
    const controller = await connect();
    controller.send({ type: 'controller:join', code });
    const joined = (await controller.take('room:joined')) as { resumeToken: string };
    await host.take(
      'peer:status',
      (message) => message.type === 'peer:status' && message.connected,
    );
    return { host, controller, code, resumeToken: joined.resumeToken };
  }
  return { server, relay, origin, url, connect, pair };
}

const input = { type: 'input', x: 0.25, y: 0.75, slash: true, stir: 0.4, seq: 1 } as const;
const state = {
  type: 'game:state',
  phase: 'playing',
  recipe: 'tacos',
  hearts: 3,
  score: 120,
  canStart: false,
  canResume: false,
  starting: false,
  blade: 'citrus',
  controlMode: 'mouse',
  notice: '',
} as const;

test('pairage par code et relais bidirectionnel sans champs arbitraires', async (t) => {
  const { pair, relay } = await fixture(t);
  const { host, controller, code } = await pair();
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(relay.roomCount, 1);
  controller.send({ ...input, extra: '<script>bad</script>' });
  assert.deepEqual(await host.take('input'), input);
  host.send(state);
  assert.deepEqual(await controller.take('game:state'), state);
});

test('valeurs invalides, usurpation des rôles et séquences rejouées ne passent pas', async (t) => {
  const { pair } = await fixture(t);
  const { host, controller } = await pair();
  host.send(input);
  await host.take('error');
  controller.send(state);
  await controller.take('error');
  controller.send({ ...input, x: -0.1 });
  await controller.take('error');
  controller.send({ ...input, seq: 0.5 });
  await controller.take('error');
  controller.send(input);
  assert.deepEqual(await host.take('input'), input);
  controller.send(input);
  controller.send({ ...input, seq: 2 });
  assert.deepEqual(await host.take('input'), { ...input, seq: 2 });
  assert.equal(host.messages.filter((message) => message.type === 'input').length, 0);
});

test('les commandes et réglages validés sont transmis uniquement au PC du téléphone', async (t) => {
  const { pair } = await fixture(t);
  const { host, controller } = await pair();
  for (const action of ['start', 'pause', 'resume'] as const) {
    controller.send({ type: 'controller:action', action, phase: 'result', score: 999 });
    assert.deepEqual(await host.take('controller:action'), {
      type: 'controller:action',
      action,
    });
  }
  for (const settings of [
    { mode: 'motion', blade: 'mint' },
    { mode: 'touch', blade: 'berry' },
  ] as const) {
    controller.send({ type: 'controller:settings', ...settings, canStart: true });
    assert.deepEqual(await host.take('controller:settings'), {
      type: 'controller:settings',
      ...settings,
    });
  }
  assert.equal(
    controller.messages.some(
      (message) => message.type === 'controller:action' || message.type === 'controller:settings',
    ),
    false,
  );
});

test('un PC ou un client non appairé ne peut pas usurper les commandes du téléphone', async (t) => {
  const { pair, connect } = await fixture(t);
  const { host, controller } = await pair();
  const stranger = await connect();
  for (const client of [host, stranger]) {
    client.send({ type: 'controller:action', action: 'start' });
    await client.take('error');
    client.send({ type: 'controller:settings', mode: 'touch', blade: 'mint' });
    await client.take('error');
  }
  for (const message of [
    { type: 'controller:action', action: 'finish' },
    { type: 'controller:settings', mode: 'mouse', blade: 'mint' },
    { type: 'controller:settings', mode: 'touch', blade: 'unknown' },
  ]) {
    controller.send(message);
    await controller.take('error');
  }
  controller.send(input);
  await host.take('input'); // Processing barrier for all preceding controller messages.
  assert.equal(
    host.messages.some(
      (message) => message.type === 'controller:action' || message.type === 'controller:settings',
    ),
    false,
  );
});

test('les requêtes du téléphone ne changent pas l’état rejoué et la reprise reçoit le compte à rebours', async (t) => {
  const { pair, connect } = await fixture(t);
  const { host, controller, code, resumeToken } = await pair();
  const ready = { ...state, phase: 'ready', canStart: true, controlMode: 'motion' } as const;
  host.send(ready);
  assert.deepEqual(await controller.take('game:state'), ready);
  controller.send({ type: 'controller:settings', mode: 'touch', blade: 'berry' });
  await host.take('controller:settings');
  controller.send({ type: 'controller:action', action: 'start' });
  await host.take('controller:action');
  const resumed = await connect();
  resumed.send({ type: 'controller:join', code, resumeToken });
  await resumed.take('room:joined');
  assert.deepEqual(await resumed.take('game:state'), ready);
  const countdown = {
    ...ready,
    phase: 'countdown',
    canStart: false,
    starting: true,
    blade: 'berry',
    controlMode: 'touch',
    notice: 'Prépare ta lame !',
  } as const;
  host.send(countdown);
  assert.deepEqual(await resumed.take('game:state'), countdown);
  const next = await connect();
  next.send({ type: 'controller:join', code, resumeToken });
  await next.take('room:joined');
  assert.deepEqual(await next.take('game:state'), countdown);
});

test('le budget des commandes est distinct des mouvements et protège aussi les réglages', async (t) => {
  const { pair } = await fixture(t);
  const { host, controller } = await pair();
  for (let seq = 1; seq <= 100; seq += 1) controller.send({ ...input, seq });
  controller.send({ type: 'controller:action', action: 'start' });
  assert.deepEqual(await host.take('controller:action'), {
    type: 'controller:action',
    action: 'start',
  });
  // Actions and settings share eight burst tokens; input has its own larger allowance.
  for (let index = 0; index < 9; index += 1)
    controller.send({ type: 'controller:settings', mode: 'touch', blade: 'mint' });
  const limited = await controller.take(
    'error',
    (message) => message.type === 'error' && /Trop de commandes/.test(message.message),
  );
  assert.equal(limited.type, 'error');
  controller.send({ ...input, seq: 101 });
  assert.deepEqual(
    await host.take('input', (message) => message.type === 'input' && message.seq === 101),
    { ...input, seq: 101 },
  );
});

test('un ancien état reçoit des valeurs sûres sans autoriser de commande distante', async (t) => {
  const { pair } = await fixture(t);
  const { host, controller } = await pair();
  host.send({ type: 'game:state', phase: 'playing', recipe: 'tacos', hearts: 3, score: 120 });
  assert.deepEqual(await controller.take('game:state'), state);
});

test('un salon occupé refuse un second téléphone puis permet une reconnexion', async (t) => {
  const { pair, connect, relay } = await fixture(t);
  const { host, controller, code, resumeToken } = await pair();
  // Clear initial "disconnected" status so the assertion observes the actual disconnection.
  await host.take('peer:status', (message) => message.type === 'peer:status' && !message.connected);
  host.send(state);
  await controller.take('game:state');
  const replacement = await connect();
  replacement.send({ type: 'controller:join', code });
  const occupied = await replacement.take('error');
  assert.match((occupied as { message: string }).message, /déjà connecté/);
  controller.socket.close();
  await host.take('peer:status', (message) => message.type === 'peer:status' && !message.connected);
  replacement.send({ type: 'controller:join', code: code.toLowerCase(), resumeToken });
  await replacement.take('room:joined');
  assert.deepEqual(await replacement.take('game:state'), state);
  replacement.send(input);
  assert.deepEqual(await host.take('input'), input);
  assert.equal(relay.roomCount, 1);
});

test('le propriétaire reprend un socket vivant et une ancienne connexion ne reprend pas le contrôle', async (t) => {
  const { pair, connect } = await fixture(t);
  const { host, controller, code, resumeToken } = await pair();
  assert.match(resumeToken, /^[A-Za-z0-9_-]{43}$/);
  const resumed = await connect();
  const oldClosed = once(controller.socket, 'close');
  resumed.send({ type: 'controller:join', code, resumeToken });
  const joined = (await resumed.take('room:joined')) as { resumeToken: string };
  assert.equal(joined.resumeToken, resumeToken);
  assert.equal((await oldClosed)[0], 4001);
  resumed.send({ ...input, source: 'motion' });
  assert.deepEqual(await host.take('input'), { ...input, source: 'motion' });
});

test('la réservation de reprise bloque un tiers puis expire', async (t) => {
  const { pair, connect } = await fixture(t, { controllerGraceMs: 60 });
  const { host, controller, code, resumeToken } = await pair();
  await host.take('peer:status', (message) => message.type === 'peer:status' && !message.connected);
  controller.socket.close();
  await host.take('peer:status', (message) => message.type === 'peer:status' && !message.connected);
  const visitor = await connect();
  visitor.send({ type: 'controller:join', code });
  const busy = (await visitor.take('error')) as { code: string; recoverable: boolean };
  assert.equal(busy.code, 'ROOM_BUSY');
  assert.equal(busy.recoverable, true);
  await new Promise((resolve) => setTimeout(resolve, 75));
  visitor.send({ type: 'controller:join', code });
  const joined = (await visitor.take('room:joined')) as { resumeToken: string };
  assert.notEqual(joined.resumeToken, resumeToken);
});

test('quitter volontairement libère immédiatement le téléphone suivant et valide la source', async (t) => {
  const { pair, connect } = await fixture(t);
  const { host, controller, code } = await pair();
  const closed = once(controller.socket, 'close');
  controller.send({ type: 'controller:leave' });
  await closed;
  const next = await connect();
  next.send({ type: 'controller:join', code });
  await next.take('room:joined');
  next.send({ ...input, source: 'unknown' });
  await next.take('error');
  next.send({ ...input, source: 'touch' });
  assert.deepEqual(await host.take('input'), { ...input, source: 'touch' });
});

test('fermer le PC détruit son salon et libère le téléphone', async (t) => {
  const { pair, relay, connect } = await fixture(t);
  const { host, controller, code } = await pair();
  host.socket.close();
  await controller.take(
    'peer:status',
    (message) => message.type === 'peer:status' && !message.connected,
  );
  assert.equal(relay.roomCount, 0);
  controller.send({ type: 'controller:join', code });
  assert.match(((await controller.take('error')) as { message: string }).message, /introuvable/);
  const newHost = await connect();
  newHost.send({ type: 'host:create' });
  const created = (await newHost.take('room:created')) as { code: string };
  controller.send({ type: 'controller:join', code: created.code });
  await controller.take('room:joined');
  assert.equal(relay.roomCount, 1);
});

test('une origine étrangère ou absente ne peut pas ouvrir le relais', async (t) => {
  const { url } = await fixture(t);
  for (const origin of ['https://attacker.example', undefined]) {
    const socket = new WebSocket(url, origin ? { origin } : {});
    const [error] = await once(socket, 'error');
    assert.match(String(error), /403/);
  }
});

test('messages binaires refusés et charge supérieure à 2 Ko interrompue', async (t) => {
  const { connect } = await fixture(t);
  const client = await connect();
  client.socket.send(Buffer.from('{}'));
  assert.match(((await client.take('error')) as { message: string }).message, /JSON invalide/);
  client.socket.send('x'.repeat(2_049));
  const [code] = await once(client.socket, 'close');
  assert.equal(code, 1009);
});

test('la création répétée est idempotente et les recherches de codes sont limitées', async (t) => {
  const { connect, relay } = await fixture(t);
  const host = await connect();
  host.send({ type: 'host:create' });
  const original = await host.take('room:created');
  host.send({ type: 'host:create' });
  assert.deepEqual(await host.take('room:created'), original);
  assert.equal(relay.roomCount, 1);
  const client = await connect();
  for (let index = 0; index < 9; index += 1)
    client.send({ type: 'controller:join', code: 'AAAAAA' });
  const limited = await client.take(
    'error',
    (message) => message.type === 'error' && /Trop de demandes/.test(message.message),
  );
  assert.equal(limited.type, 'error');
});

test('une connexion non appairée expire et libère ses ressources', async (t) => {
  const { connect, relay } = await fixture(t, { heartbeatMs: 20, unpairedTimeoutMs: 35 });
  const client = await connect();
  await once(client.socket, 'close');
  assert.equal(relay.connectionCount, 0);
});

test('une origine HTTPS configurée peut appairer son téléphone au PC local', async (t) => {
  const publicOrigin = 'https://cooking.example.test';
  const { connect, url } = await fixture(t, { extraOrigins: [publicOrigin] });
  const host = await connect();
  host.send({ type: 'host:create' });
  const created = (await host.take('room:created')) as { code: string };
  const socket = new WebSocket(url, { origin: publicOrigin });
  const phone = new Inbox(socket);
  await once(socket, 'open');
  phone.send({ type: 'controller:join', code: created.code });
  await phone.take('room:joined');
  phone.send(input);
  assert.deepEqual(await host.take('input'), input);
});

test('en production les chemins WebSocket inconnus sont fermés', async (t) => {
  const { url, origin } = await fixture(t);
  const socket = new WebSocket(url.replace('/relay', '/unknown'), { origin });
  const [error] = await once(socket, 'error');
  assert.match(String(error), /socket hang up|ECONNRESET/);
});

test('Vite HMR et le relais partagent le serveur sans double upgrade', async (t) => {
  const { createServer: createViteServer } = await import('vite');
  const cacheDir = await mkdtemp(join(tmpdir(), 'cookingninja-vite-test-'));
  let vite: Awaited<ReturnType<typeof createViteServer>> | undefined;
  let hmr: WebSocket | undefined;
  t.after(async () => {
    hmr?.terminate();
    await vite?.close();
    // Only remove the unique directory created by this test, never the app cache.
    await rm(cacheDir, { recursive: true, force: true });
  });
  const { server, origin, url, pair } = await fixture(t, { allowOtherUpgrades: true });
  vite = await createViteServer({
    configFile: false,
    cacheDir,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: { server } },
    appType: 'custom',
  });
  hmr = new WebSocket(
    `${url.replace('/relay', '/')}?token=${vite.config.webSocketToken}`,
    'vite-hmr',
    { origin },
  );
  const hmrInbox = new Inbox(hmr);
  await once(hmr, 'open');
  const connected = await hmrInbox.take('connected' as ServerMessage['type']);
  assert.deepEqual(connected, { type: 'connected' });
  const { host, controller } = await pair();
  controller.send(input);
  assert.deepEqual(await host.take('input'), input);
  hmr.close();
  await once(hmr, 'close');
});
