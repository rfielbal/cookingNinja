import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'cookingninja-startup-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const scores = '{"version":1,"runs":[]}\n';
  await writeFile(join(directory, 'stand.json'), scores);
  return { directory, scores };
}

function launch(
  t: TestContext,
  directory: string,
  port: number,
  overrides: NodeJS.ProcessEnv = {},
) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: String(port),
    STAND_DATA_DIR: directory,
  };
  delete env.PUBLIC_ORIGIN;
  delete env.HTTPS_KEY_FILE;
  delete env.HTTPS_CERT_FILE;
  Object.assign(env, overrides);
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (data: Buffer) => (output += data.toString()));
  child.stderr.on('data', (data: Buffer) => (output += data.toString()));
  const exited = once(child, 'exit');
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await exited;
    }
  });
  return { child, exited, output: () => output };
}

test(
  'un certificat TLS invalide ne verrouille pas le classement',
  { timeout: 8_000 },
  async (t) => {
    const { directory, scores } = await fixture(t);
    const key = join(directory, 'invalid-key.pem');
    const cert = join(directory, 'invalid-cert.pem');
    await writeFile(key, 'This is not a PEM key.');
    await writeFile(cert, 'This is not a PEM certificate.');
    const { exited, output } = launch(t, directory, 65534, {
      HTTPS_KEY_FILE: key,
      HTTPS_CERT_FILE: cert,
    });
    const [code] = await exited;
    assert.equal(code, 1, output());
    assert.match(output(), /PEM|DECODER|SSL/);
    await assert.rejects(access(join(directory, 'stand.lock')), { code: 'ENOENT' });
    assert.equal(await readFile(join(directory, 'stand.json'), 'utf8'), scores);
  },
);

test(
  'un port occupé libère le verrou sans modifier les scores ni arrêter le serveur présent',
  { timeout: 8_000 },
  async (t) => {
    const { directory, scores } = await fixture(t);
    const occupied = createServer();
    occupied.listen(0, '127.0.0.1');
    await once(occupied, 'listening');
    t.after(() => new Promise<void>((resolve) => occupied.close(() => resolve())));
    const { port } = occupied.address() as AddressInfo;
    const { exited, output } = launch(t, directory, port);
    const [code] = await exited;
    assert.equal(code, 1, output());
    assert.match(output(), /déjà utilisé/);
    assert.equal(occupied.listening, true);
    await assert.rejects(access(join(directory, 'stand.lock')), { code: 'ENOENT' });
    assert.equal(await readFile(join(directory, 'stand.json'), 'utf8'), scores);
  },
);

test(
  'un arrêt normal permet de relancer le même classement et conserve les scores',
  { timeout: 12_000 },
  async (t) => {
    const { directory, scores } = await fixture(t);
    const reservation = createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const { port } = reservation.address() as AddressInfo;
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    for (let attempt = 0; attempt < 2; attempt++) {
      const { child, exited, output } = launch(t, directory, port);
      const deadline = Date.now() + 4_000;
      let ready = false;
      while (Date.now() < deadline && child.exitCode === null) {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/api/config`, {
            signal: AbortSignal.timeout(250),
          });
          if (response.ok && (await response.json()).secure === false) {
            ready = true;
            break;
          }
        } catch {
          // The child has not bound its listening socket yet.
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.equal(ready, true, output());
      await access(join(directory, 'stand.lock'));
      child.kill('SIGTERM');
      const [code] = await exited;
      assert.equal(code, 0, output());
      await assert.rejects(access(join(directory, 'stand.lock')), { code: 'ENOENT' });
      assert.equal(await readFile(join(directory, 'stand.json'), 'utf8'), scores);
    }
  },
);
