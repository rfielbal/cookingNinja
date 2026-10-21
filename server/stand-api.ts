import express, { type ErrorRequestHandler, type Request } from 'express';
import type { TLSSocket } from 'node:tls';
import {
  RULES_VERSION,
  StandError,
  parseLeaderboardQuery,
  parseRunResult,
  parseRunStart,
} from './stand-domain.js';
import type { StandStore } from './stand-store.js';

/** No forwarded header is trusted: a loopback reverse proxy with a public Host stays public. */
export function isLocalOperator(request: Pick<Request, 'socket' | 'headers'>): boolean {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? ''))
    return false;
  const host = request.headers.host;
  const origin = request.headers.origin;
  if (!host || !origin) return false;
  try {
    const scheme = (request.socket as TLSSocket).encrypted ? 'https' : 'http';
    const url = new URL(`${scheme}://${host}`);
    return (
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash &&
      origin === url.origin
    );
  } catch {
    return false;
  }
}

export function createStandRouter(store: StandStore) {
  const router = express.Router();
  const buckets = new Map<string, { tokens: number; at: number }>();
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.use((request, response, next) => {
    const writing = request.method === 'POST' || request.method === 'PATCH';
    if (writing && !isLocalOperator(request)) {
      response.status(403).json({
        error:
          'Les résultats se gèrent uniquement depuis le PC, ouvert sur localhost ou 127.0.0.1.',
      });
      return;
    }
    const key = `${writing ? 'write' : 'read'}:${request.socket.remoteAddress ?? 'unknown'}`;
    const now = Date.now();
    const capacity = writing ? 30 : 120;
    const bucket = buckets.get(key) ?? { tokens: capacity, at: now };
    bucket.tokens = Math.min(capacity, bucket.tokens + (now - bucket.at) / (writing ? 2_000 : 250));
    bucket.at = now;
    if (buckets.size > 500)
      for (const [id, value] of buckets) if (now - value.at > 60_000) buckets.delete(id);
    if (buckets.size >= 1_000 && !buckets.has(key)) {
      response.status(429).json({ error: 'Le serveur est occupé. Réessayez dans un instant.' });
      return;
    }
    buckets.set(key, bucket);
    if (bucket.tokens < 1) {
      response.setHeader('Retry-After', writing ? '2' : '1');
      response.status(429).json({ error: 'Trop de demandes. Réessayez dans un instant.' });
      return;
    }
    bucket.tokens--;
    next();
  });
  router.use(express.json({ limit: '2kb', strict: true }));
  router.get('/stand/config', (_request, response) =>
    response.json({ rulesVersion: RULES_VERSION }),
  );
  router.post('/runs', async (request, response) => {
    const result = await store.create(parseRunStart(request.body));
    response.status(201).json(result);
  });
  const finish: express.RequestHandler = async (request, response) => {
    const id = request.params.id;
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id))
      throw new StandError(400, 'Identifiant de partie invalide.');
    const run = await store.finish(id, parseRunResult(request.body));
    response.json({ run });
  };
  router.post('/runs/:id/finish', finish);
  router.patch('/runs/:id/finish', finish);
  router.get('/leaderboard', async (request, response) => {
    response.json(await store.leaderboardPage(parseLeaderboardQuery(request.query)));
  });
  const errors: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    if (error instanceof StandError) {
      response.status(error.status).json({ error: error.message });
      return;
    }
    const parserError = error as { type?: string };
    if (parserError.type === 'entity.too.large') {
      response.status(413).json({ error: 'Message trop volumineux.' });
      return;
    }
    if (parserError.type === 'entity.parse.failed') {
      response.status(400).json({ error: 'Message JSON invalide.' });
      return;
    }
    response.status(503).json({
      error: 'Le classement est momentanément indisponible. Le résultat n’a pas été confirmé.',
    });
  };
  router.use(errors);
  return router;
}
