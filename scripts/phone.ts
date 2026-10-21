import { spawn, type ChildProcess, type StdioOptions } from 'node:child_process';
import { constants } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { delimiter, dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const installDocumentation = 'https://developers.cloudflare.com/tunnel/downloads/';

/** Accept only the temporary hostname printed by Cloudflare, never an arbitrary URL. */
export function extractQuickTunnelOrigin(output: string): string | undefined {
  const match = output.match(
    /https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com(?=$|[\s/"'|)\]}?#])/i,
  );
  return match ? new URL(match[0]).origin : undefined;
}

export function parsePhonePort(value: string | undefined): number {
  const text = value?.trim() ?? '5174';
  const port = Number(text);
  if (!/^\d+$/.test(text) || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PHONE_PORT doit être un entier compris entre 1 et 65535.');
  }
  return port;
}

async function findCloudflared(): Promise<string | undefined> {
  const executable = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  for (const directory of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const candidate = resolve(directory, executable);
    try {
      await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Continue through PATH, without installing or altering the environment.
    }
  }
  return undefined;
}

/** npm sets npm_execpath; a direct Node launch can resolve the installed CLI too. */
export async function resolveNpmCli(preferredPath = process.env.npm_execpath): Promise<string> {
  const candidates = preferredPath ? [preferredPath] : [];
  for (const directory of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    if (process.platform === 'win32') {
      candidates.push(resolve(directory, 'node_modules/npm/bin/npm-cli.js'));
    } else {
      try {
        const executable = await realpath(resolve(directory, 'npm'));
        if (executable.endsWith('.js')) candidates.push(executable);
      } catch {
        // npm may live beside another Node distribution later in PATH.
      }
    }
  }
  candidates.push(
    resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
  );
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.R_OK);
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Try the next installation without spawning a shell.
    }
  }
  throw new Error(
    'npm est introuvable. Installez Node.js avec npm, puis relancez « npm run phone ».',
  );
}

async function assertPortFree(port: number): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const probe = createServer();
    probe.once('error', (error: NodeJS.ErrnoException) => {
      reject(
        new Error(
          error.code === 'EADDRINUSE'
            ? `Le port ${port} est déjà utilisé. Le serveur existant reste intact. Choisissez un autre PHONE_PORT, par exemple PHONE_PORT=5175 npm run phone.`
            : `Impossible d’utiliser le port ${port} (${error.code ?? error.message}).`,
        ),
      );
    });
    probe.listen(port, '127.0.0.1', () =>
      probe.close((error) => (error ? reject(error) : resolvePromise())),
    );
  });
}

function aborted(): Error {
  return new Error('Arrêt demandé.');
}

function waitForExit(child: ChildProcess, signal: AbortSignal): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const cleanup = () => {
      child.off('exit', onExit);
      child.off('error', onError);
      signal.removeEventListener('abort', onAbort);
    };
    const onExit = (code: number | null) => {
      cleanup();
      if (code === 0) resolvePromise();
      else
        reject(
          new Error(
            `La compilation a échoué (code ${code ?? 'interrompu'}). Corrigez les erreurs affichées puis relancez npm run phone.`,
          ),
        );
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onAbort = () => {
      cleanup();
      reject(aborted());
    };
    child.once('exit', onExit);
    child.once('error', onError);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

function waitForTunnelOrigin(child: ChildProcess, signal: AbortSignal): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let output = '';
    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout?.off('data', onData);
      child.stderr?.off('data', onData);
      child.off('exit', onExit);
      child.off('error', onError);
      signal.removeEventListener('abort', onAbort);
    };
    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onData = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-32_768);
      const origin = extractQuickTunnelOrigin(output);
      if (origin) {
        cleanup();
        resolvePromise(origin);
      }
    };
    const onExit = (code: number | null) =>
      fail(
        new Error(
          `Cloudflare s’est arrêté avant de fournir une adresse (code ${code ?? 'interrompu'}). Vérifiez la connexion Internet et votre éventuelle configuration ~/.cloudflared/config.yml.`,
        ),
      );
    const onError = (error: Error) =>
      fail(new Error(`Impossible de démarrer cloudflared : ${error.message}`));
    const onAbort = () => fail(aborted());
    const timeout = setTimeout(
      () =>
        fail(
          new Error(
            'Cloudflare n’a pas fourni d’adresse HTTPS après 45 secondes. Vérifiez votre connexion Internet, puis réessayez.',
          ),
        ),
      45_000,
    );
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.once('exit', onExit);
    child.once('error', onError);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

async function waitForServer(port: number, origin: string, signal: AbortSignal): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/config`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(1_000)]),
      });
      if (response.ok) {
        const config = (await response.json()) as { controllerOrigin?: string; secure?: boolean };
        if (config.controllerOrigin === origin && config.secure === true) return;
      }
    } catch {
      // The production server is still starting; cancellation is checked below.
    }
    await delay(150, undefined, { signal });
  }
  throw new Error(
    'Le serveur du jeu ne répond pas après 15 secondes. Consultez les erreurs affichées ci-dessus.',
  );
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolvePromise) => {
    const timer = setTimeout(() => {
      // The PID comes only from a child created by this invocation.
      child.kill('SIGKILL');
      resolvePromise();
    }, 3_000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolvePromise();
    });
    child.kill('SIGTERM');
  });
}

/** Explicit entry point; importing parsing helpers never starts a public tunnel. */
export async function main(): Promise<void> {
  const children = new Set<ChildProcess>();
  const cancellation = new AbortController();
  let failure: Error | undefined;
  let finish!: () => void;
  const lifetime = new Promise<void>((resolvePromise) => {
    finish = resolvePromise;
  });
  const stop = (error?: Error) => {
    if (error && !failure) failure = error;
    cancellation.abort();
    finish();
  };
  const onSignal = () => stop();
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  function launch(
    label: string,
    executable: string,
    args: string[],
    stdio: StdioOptions,
    env = process.env,
    persistent = false,
  ): ChildProcess {
    cancellation.signal.throwIfAborted();
    const child = spawn(executable, args, { cwd: projectRoot, env, stdio, shell: false });
    children.add(child);
    child.once('error', (error) => stop(new Error(`${label} : ${error.message}`)));
    child.once('exit', (code) => {
      children.delete(child);
      if (persistent && !cancellation.signal.aborted) {
        stop(
          new Error(
            `${label} s’est arrêté (code ${code ?? 'interrompu'}). Relancez npm run phone.`,
          ),
        );
      }
    });
    return child;
  }

  try {
    const port = parsePhonePort(process.env.PHONE_PORT);
    const cloudflared = await findCloudflared();
    if (!cloudflared) {
      throw new Error(
        process.platform === 'darwin'
          ? 'cloudflared est absent. Installez-le avec « brew install cloudflared », puis relancez « npm run phone ».'
          : `cloudflared est absent. Installez-le depuis ${installDocumentation}, puis relancez « npm run phone ».`,
      );
    }
    const npmCli = await resolveNpmCli();
    await assertPortFree(port);
    console.info('CookingNinja · Préparation du mode téléphone HTTPS…');
    await waitForExit(
      launch('Compilation', process.execPath, [npmCli, 'run', 'build'], 'inherit'),
      cancellation.signal,
    );
    await assertPortFree(port);
    console.info(
      'Lien temporaire accessible sur Internet ; le trafic passe par Cloudflare jusqu’à Ctrl+C.',
    );
    const tunnel = launch(
      'Cloudflare',
      cloudflared,
      ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'],
      ['ignore', 'pipe', 'pipe'],
      process.env,
      true,
    );
    const publicOrigin = await waitForTunnelOrigin(tunnel, cancellation.signal);
    // Keep draining the pipes after the initial address has been captured.
    tunnel.stdout?.resume();
    tunnel.stderr?.resume();
    const serverEnvironment: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      PUBLIC_ORIGIN: publicOrigin,
    };
    // TLS terminates at Cloudflare; the isolated loopback origin stays HTTP.
    delete serverEnvironment.HTTPS_KEY_FILE;
    delete serverEnvironment.HTTPS_CERT_FILE;
    launch(
      'Serveur CookingNinja',
      process.execPath,
      ['--import', 'tsx', join(projectRoot, 'server', 'index.ts')],
      'inherit',
      serverEnvironment,
      true,
    );
    await waitForServer(port, publicOrigin, cancellation.signal);
    console.info(`\nPC : http://localhost:${port}`);
    console.info(`Téléphone HTTPS : ${publicOrigin}/controller`);
    console.info('Sur le PC, ouvrez « Connecter mon téléphone » puis scannez le nouveau QR code.');
    console.info(
      'Sur le téléphone, autorisez les mouvements. Gardez ce terminal ouvert ; Ctrl+C arrête ce mode.\n',
    );
    await lifetime;
  } catch (error) {
    if (!cancellation.signal.aborted && !failure)
      failure = error instanceof Error ? error : new Error(String(error));
  } finally {
    cancellation.abort();
    await Promise.all([...children].map(stopChild));
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
  if (failure) {
    console.error(`\nCookingNinja : ${failure.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
