import { readFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { hostname, networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createRelay } from './relay.js';
import { createStandRouter } from './stand-api.js';
import { StandStore } from './stand-store.js';
import type { ServerConfig } from '../shared/protocol.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT ?? 5173);
const host = process.env.HOST ?? '0.0.0.0';
if (!Number.isInteger(port) || port < 1 || port > 65_535)
  throw new Error('PORT doit être compris entre 1 et 65535.');

const keyPath = process.env.HTTPS_KEY_FILE;
const certPath = process.env.HTTPS_CERT_FILE;
if (Boolean(keyPath) !== Boolean(certPath))
  throw new Error('HTTPS_KEY_FILE et HTTPS_CERT_FILE doivent être configurés ensemble.');
const tls =
  keyPath && certPath
    ? { key: await readFile(keyPath), cert: await readFile(certPath) }
    : undefined;
const scheme = tls ? 'https' : 'http';
let publicOrigin: string | undefined;
if (process.env.PUBLIC_ORIGIN) {
  const url = new URL(process.env.PUBLIC_ORIGIN);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'PUBLIC_ORIGIN doit être une origine HTTPS, par exemple https://cooking.example.com.',
    );
  }
  publicOrigin = url.origin;
}

const addresses = Object.values(networkInterfaces()).flatMap((network) =>
  (network ?? [])
    .filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => address.address),
);
const localUrls = [...new Set(addresses)].map((address) => `${scheme}://${address}:${port}`);
const allowedOrigins = [
  `${scheme}://localhost:${port}`,
  `${scheme}://127.0.0.1:${port}`,
  `${scheme}://[::1]:${port}`,
  `${scheme}://${hostname()}:${port}`,
  ...localUrls,
];
if (host !== '0.0.0.0' && host !== '::')
  allowedOrigins.push(`${scheme}://${host.includes(':') ? `[${host}]` : host}:${port}`);
if (publicOrigin) allowedOrigins.push(publicOrigin);

const app = express();
app.disable('x-powered-by');
app.use((_request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  // Some browsers fall back to absolute orientation even for deviceorientation.
  response.setHeader(
    'Permissions-Policy',
    'accelerometer=(self), gyroscope=(self), magnetometer=(self)',
  );
  next();
});
app.get('/api/config', (_request, response) => {
  const config: ServerConfig = {
    ...(publicOrigin ? { controllerOrigin: publicOrigin } : {}),
    localUrls,
    secure: Boolean(tls || publicOrigin),
  };
  response.setHeader('Cache-Control', 'no-store');
  response.json(config);
});
const standStore = await StandStore.open(
  resolve(process.env.STAND_DATA_DIR ?? resolve(root, 'data')),
);
app.use('/api', createStandRouter(standStore));

const server = tls ? createHttpsServer(tls, app) : createHttpServer(app);
const production = process.env.NODE_ENV === 'production';
const relay = createRelay({ server, allowedOrigins, allowOtherUpgrades: !production });
let closeVite: (() => Promise<void>) | undefined;
if (production) {
  app.use(express.static(resolve(root, 'dist'), { index: false }));
  app.use((request, response, next) => {
    if (request.method !== 'GET' || request.path.startsWith('/api/')) return next();
    response.sendFile(resolve(root, 'dist/index.html'));
  });
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    root,
    server: {
      middlewareMode: true,
      hmr: { server },
      allowedHosts: [hostname(), ...(publicOrigin ? [new URL(publicOrigin).hostname] : [])],
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);
  closeVite = () => vite.close();
}

server.listen(port, host, () => {
  console.info(`CookingNinja · ${scheme}://localhost:${port}`);
  for (const url of localUrls) console.info(`Réseau local · ${url}`);
  if (publicOrigin) console.info(`Téléphone (HTTPS) · ${publicOrigin}`);
  if (!tls && !publicOrigin)
    console.info(
      'Mouvements du téléphone : configurez HTTPS ou PUBLIC_ORIGIN (tunnel HTTPS). Le mode tactile reste disponible en HTTP.',
    );
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await relay.close();
  await standStore.close();
  await closeVite?.();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3_000).unref();
}
process.on('SIGTERM', () => {
  void shutdown();
});
process.on('SIGINT', () => {
  void shutdown();
});
