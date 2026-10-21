import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import {
  parseClientMessage,
  type GameStateMessage,
  type ServerMessage,
} from '../shared/protocol.js';

interface Room {
  code: string;
  host: WebSocket;
  controller?: WebSocket;
  lastState?: GameStateMessage;
  resumeToken?: string;
  disconnectedAt?: number;
}

interface Client {
  role?: 'host' | 'controller';
  room?: Room;
  lastSequence: number;
  alive: boolean;
  createdAt: number;
  tokens: number;
  tokensAt: number;
  controlTokens: number;
  controlTokensAt: number;
  commandTokens: number;
  commandTokensAt: number;
  violations: number;
}

export interface RelayOptions {
  server: HttpServer | HttpsServer;
  /** Exact browser origins. Missing Origin headers are refused, too. */
  allowedOrigins: readonly string[];
  heartbeatMs?: number;
  unpairedTimeoutMs?: number;
  maxRooms?: number;
  maxConnections?: number;
  /** Development-only: let Vite's separate listener handle its HMR socket. */
  allowOtherUpgrades?: boolean;
  controllerGraceMs?: number;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Owns no listening socket, allowing real WebSocket integration tests. */
export function createRelay({
  server,
  allowedOrigins,
  heartbeatMs = 25_000,
  unpairedTimeoutMs = 60_000,
  maxRooms = 100,
  maxConnections = 250,
  allowOtherUpgrades = false,
  controllerGraceMs = 30_000,
}: RelayOptions) {
  const rooms = new Map<string, Room>();
  const clients = new Map<WebSocket, Client>();
  const origins = new Set(allowedOrigins);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2_048, perMessageDeflate: false });

  function send(socket: WebSocket | undefined, message: ServerMessage) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    // A stalled phone must not build an unbounded queue of game updates.
    if (socket.bufferedAmount > 64 * 1_024) {
      socket.close(1008, 'Connexion trop lente');
      return;
    }
    socket.send(JSON.stringify(message));
  }

  function error(socket: WebSocket, message: string, code?: 'ROOM_BUSY' | 'ROOM_NOT_FOUND') {
    send(socket, {
      type: 'error',
      message,
      ...(code ? { code, recoverable: code === 'ROOM_BUSY' } : {}),
    });
  }

  function invalid(socket: WebSocket, client: Client, message: string) {
    error(socket, message);
    client.violations += 1;
    if (client.violations >= 8) socket.close(1008, 'Messages invalides');
  }

  function consume(client: Client, kind: 'message' | 'pairing' | 'command' = 'message'): boolean {
    const now = Date.now();
    const key =
      kind === 'pairing' ? 'controlTokens' : kind === 'command' ? 'commandTokens' : 'tokens';
    const timeKey =
      kind === 'pairing' ? 'controlTokensAt' : kind === 'command' ? 'commandTokensAt' : 'tokensAt';
    const capacity = kind === 'message' ? 240 : 8;
    const perSecond = kind === 'message' ? 120 : kind === 'command' ? 4 : 1;
    client[key] = Math.min(capacity, client[key] + ((now - client[timeKey]) * perSecond) / 1_000);
    client[timeKey] = now;
    if (client[key] < 1) return false;
    client[key] -= 1;
    return true;
  }

  function detach(socket: WebSocket) {
    const client = clients.get(socket);
    if (!client) return;
    const room = client.room;
    if (room && client.role === 'host' && room.host === socket) {
      rooms.delete(room.code);
      const controller = room.controller;
      if (controller) {
        send(controller, { type: 'peer:status', connected: false });
        const peer = clients.get(controller);
        if (peer) {
          peer.room = undefined;
          peer.role = undefined;
          peer.createdAt = Date.now();
        }
      }
      room.controller = undefined;
    } else if (room && client.role === 'controller' && room.controller === socket) {
      room.controller = undefined;
      room.disconnectedAt = Date.now();
      send(room.host, { type: 'peer:status', connected: false });
    }
    clients.delete(socket);
  }

  wss.on('connection', (socket) => {
    const now = Date.now();
    const client: Client = {
      lastSequence: -1,
      alive: true,
      createdAt: now,
      tokens: 240,
      tokensAt: now,
      controlTokens: 8,
      controlTokensAt: now,
      commandTokens: 8,
      commandTokensAt: now,
      violations: 0,
    };
    clients.set(socket, client);
    socket.on('error', () => {
      /* close/heartbeat performs cleanup; avoid an unhandled emitter error. */
    });
    socket.on('pong', () => {
      client.alive = true;
    });
    socket.on('close', () => detach(socket));
    socket.on('message', (data, isBinary) => {
      if (!consume(client)) {
        socket.close(1008, 'Trop de messages');
        return;
      }
      let parsed: unknown;
      try {
        if (isBinary) throw new Error('Binary data');
        parsed = JSON.parse(data.toString());
      } catch {
        invalid(socket, client, 'Message JSON invalide.');
        return;
      }
      const message = parseClientMessage(parsed);
      if (!message) {
        invalid(socket, client, 'Message ou valeurs invalides.');
        return;
      }

      if (message.type === 'host:create') {
        if (!consume(client, 'pairing'))
          return invalid(socket, client, 'Trop de demandes de connexion.');
        if (client.role === 'controller')
          return error(socket, 'Ce téléphone est déjà connecté à une partie.');
        if (client.room) return send(socket, { type: 'room:created', code: client.room.code });
        if (rooms.size >= maxRooms)
          return error(socket, 'Le serveur est occupé. Réessayez plus tard.');
        let code: string;
        do {
          code = [...randomBytes(6)].map((byte) => ALPHABET[byte % ALPHABET.length]).join('');
        } while (rooms.has(code));
        const room: Room = { code, host: socket };
        client.room = room;
        client.role = 'host';
        rooms.set(code, room);
        send(socket, { type: 'room:created', code });
        send(socket, { type: 'peer:status', connected: false });
        return;
      }

      if (message.type === 'controller:join') {
        if (!consume(client, 'pairing'))
          return invalid(socket, client, 'Trop de demandes de connexion.');
        if (client.role === 'host') return error(socket, 'Cet écran héberge déjà une partie.');
        const room = rooms.get(message.code);
        if (!room)
          return error(
            socket,
            'Code introuvable. Vérifiez le code affiché sur le PC.',
            'ROOM_NOT_FOUND',
          );
        if (client.room && client.room !== room)
          return error(socket, 'Ce téléphone est déjà connecté à une autre partie.');
        const ownsSeat = Boolean(
          message.resumeToken &&
          room.resumeToken &&
          timingSafeEqual(Buffer.from(message.resumeToken), Buffer.from(room.resumeToken)),
        );
        if (
          room.controller &&
          room.controller !== socket &&
          room.controller.readyState !== WebSocket.OPEN
        ) {
          detach(room.controller);
        }
        if (
          room.controller !== socket &&
          !ownsSeat &&
          (room.controller ||
            (room.resumeToken &&
              room.disconnectedAt !== undefined &&
              Date.now() - room.disconnectedAt < controllerGraceMs))
        ) {
          return error(
            socket,
            'Un téléphone est déjà connecté ou reprend sa connexion. Réessayez dans un instant.',
            'ROOM_BUSY',
          );
        }
        if (room.controller && room.controller !== socket) {
          const previous = room.controller;
          const previousClient = clients.get(previous);
          if (previousClient) {
            previousClient.role = undefined;
            previousClient.room = undefined;
          }
          room.controller = undefined;
          previous.close(4001, 'Connexion reprise par le propriétaire');
        }
        const isNewPeer = room.controller !== socket;
        if (!ownsSeat && isNewPeer) room.resumeToken = randomBytes(32).toString('base64url');
        room.controller = socket;
        room.disconnectedAt = undefined;
        client.room = room;
        client.role = 'controller';
        if (isNewPeer) client.lastSequence = -1;
        send(socket, {
          type: 'room:joined',
          code: room.code,
          role: 'controller',
          resumeToken: room.resumeToken!,
        });
        send(socket, { type: 'peer:status', connected: true });
        send(room.host, { type: 'peer:status', connected: true });
        if (room.lastState) send(socket, room.lastState);
        return;
      }

      if (message.type === 'controller:leave') {
        if (client.role !== 'controller' || client.room?.controller !== socket) {
          return invalid(socket, client, 'Ce téléphone ne contrôle aucune partie.');
        }
        const room = client.room;
        room.controller = undefined;
        room.resumeToken = undefined;
        room.disconnectedAt = undefined;
        client.room = undefined;
        client.role = undefined;
        send(room.host, { type: 'peer:status', connected: false });
        send(socket, { type: 'peer:status', connected: false });
        socket.close(1000, 'Téléphone déconnecté');
        return;
      }

      if (message.type === 'input') {
        if (client.role !== 'controller' || client.room?.controller !== socket) {
          return invalid(socket, client, 'Seul le téléphone connecté peut envoyer des mouvements.');
        }
        if (message.seq <= client.lastSequence) return; // Ignore replayed/out-of-order input.
        client.lastSequence = message.seq;
        send(client.room.host, message);
        return;
      }

      if (message.type === 'controller:action' || message.type === 'controller:settings') {
        if (client.role !== 'controller' || client.room?.controller !== socket) {
          return invalid(socket, client, 'Seul le téléphone connecté peut envoyer des commandes.');
        }
        // Motion traffic does not consume this separate, much smaller command allowance.
        if (!consume(client, 'command')) {
          return invalid(socket, client, 'Trop de commandes. Attendez un instant.');
        }
        // A request never changes the cached game state: only the host can accept it.
        send(client.room.host, message);
        return;
      }

      if (client.role !== 'host' || client.room?.host !== socket) {
        return invalid(socket, client, 'Seul le PC peut modifier l’état de la partie.');
      }
      client.room.lastState = message;
      send(client.room.controller, message);
    });
  });

  function upgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
    let pathname: string;
    try {
      pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== '/relay') {
      if (!allowOtherUpgrades) socket.destroy();
      return;
    }
    const origin = request.headers.origin;
    if (!origin || !origins.has(origin) || clients.size >= maxConnections) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    wss.handleUpgrade(request, socket, head, (websocket) =>
      wss.emit('connection', websocket, request),
    );
  }
  server.on('upgrade', upgrade);

  const heartbeat = setInterval(() => {
    for (const [socket, client] of clients) {
      if (!client.alive || (!client.role && Date.now() - client.createdAt > unpairedTimeoutMs)) {
        socket.terminate();
        detach(socket);
        continue;
      }
      client.alive = false;
      if (socket.readyState === WebSocket.OPEN) socket.ping();
    }
  }, heartbeatMs);
  heartbeat.unref();

  return {
    get roomCount() {
      return rooms.size;
    },
    get connectionCount() {
      return clients.size;
    },
    async close(): Promise<void> {
      clearInterval(heartbeat);
      server.off('upgrade', upgrade);
      for (const socket of clients.keys()) socket.terminate();
      rooms.clear();
      clients.clear();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}
