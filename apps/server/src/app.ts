import fs from 'node:fs';
import type { IncomingMessage } from 'node:http';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';
import { PLAYER_COLORS, clientMessage, type Snapshot } from '@vtt/shared';
import type { Config } from './config';
import { newId, openDb, type Db } from './db';
import {
  GM_COOKIE,
  createGm,
  createSession,
  deleteSession,
  gmCount,
  gmFromSession,
  loginGm,
  parseCookies,
  playerCookie,
  playerFromToken,
  type Gm,
} from './auth';
import { getAdventure, getAssetRow, toAdventureRow, type AdventureRow } from './repo';
import { Rooms, type Conn } from './rooms';
import { ActionError, handleAction } from './actions';
import {
  AssetError,
  deleteAsset,
  publicAsset,
  removeAdventureFiles,
  storeAsset,
  uploadsDir,
} from './assets';
import { ImportError, exportAdventure, importAdventure } from './exporter';
import { createSampleContent } from './samples';
import type { Viewer } from './visibility';

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new HttpError(400, 'Ungültige Eingabe.');
  return r.data;
}

const nameSchema = z.string().trim().min(1).max(40);
const credentials = z.object({ name: nameSchema, password: z.string().min(8).max(200) });
const loginSchema = z.object({ name: nameSchema, password: z.string().min(1).max(200) });
const idParam = z.object({ id: z.string().min(1).max(64) });

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: 'auto' as const,
};

export async function buildApp(config: Config) {
  const db: Db = openDb(config.dataDir);
  const rooms = new Rooms(db);
  const app = Fastify({
    logger: { level: config.production ? 'warn' : 'error' },
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  await app.register(cookie);
  await app.register(multipart, { limits: { files: 1, fileSize: config.maxImportBytes } });
  await app.register(fastifyStatic, { root: uploadsDir(config.dataDir), serve: false });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message });
    if (err instanceof AssetError || err instanceof ImportError)
      return reply.status(400).send({ error: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 413 || (err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.status(413).send({ error: 'Die Datei ist zu groß.' });
    }
    if (status && status >= 400 && status < 500)
      return reply.status(status).send({ error: 'Ungültige Anfrage.' });
    app.log.error(err);
    return reply.status(500).send({ error: 'Interner Fehler.' });
  });

  /* ---------- Hilfen ---------- */

  const currentGm = (req: FastifyRequest): Gm | null => gmFromSession(db, req.cookies[GM_COOKIE]);
  const requireGm = (req: FastifyRequest): Gm =>
    currentGm(req) ?? fail(401, 'Bitte als Spielleiter anmelden.');
  function fail(status: number, message: string): never {
    throw new HttpError(status, message);
  }
  /** Abenteuer, das dem angemeldeten Spielleiter gehört. */
  const ownAdventure = (req: FastifyRequest, id: string): AdventureRow => {
    const gm = requireGm(req);
    const adv = getAdventure(db, id);
    if (!adv || adv.gmId !== gm.id) fail(404, 'Abenteuer nicht gefunden.');
    return adv;
  };
  const summary = (a: AdventureRow) => ({ id: a.id, name: a.name, inviteToken: a.inviteToken });

  /* ---------- Spielleiter-Konten ---------- */

  app.get('/api/me', async (req) => {
    const gm = currentGm(req);
    return { gm, needsSetup: gmCount(db) === 0 };
  });

  app.post('/api/setup', async (req, reply) => {
    if (gmCount(db) > 0) fail(403, 'Die Einrichtung ist bereits abgeschlossen.');
    const { name, password } = parse(credentials, req.body);
    const gm = await createGm(db, name, password);
    reply.setCookie(GM_COOKIE, createSession(db, gm.id), { ...COOKIE_OPTS, maxAge: 60 * 86400 });
    return { gm };
  });

  app.post('/api/login', async (req, reply) => {
    const { name, password } = parse(loginSchema, req.body);
    const gm = await loginGm(db, name, password);
    if (!gm) fail(401, 'Name oder Passwort stimmt nicht.');
    reply.setCookie(GM_COOKIE, createSession(db, gm.id), { ...COOKIE_OPTS, maxAge: 60 * 86400 });
    return { gm };
  });

  app.post('/api/logout', async (req, reply) => {
    const token = req.cookies[GM_COOKIE];
    if (token) deleteSession(db, token);
    reply.clearCookie(GM_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.post('/api/gms', async (req) => {
    requireGm(req);
    const { name, password } = parse(credentials, req.body);
    const exists = db.prepare('SELECT 1 FROM gm_users WHERE name = ?').get(name);
    if (exists) fail(409, 'Diesen Namen gibt es schon.');
    return { gm: await createGm(db, name, password) };
  });

  /* ---------- Abenteuer ---------- */

  app.get('/api/adventures', async (req) => {
    const gm = requireGm(req);
    const rows = db
      .prepare('SELECT * FROM adventures WHERE gm_id = ? ORDER BY created_at DESC')
      .all(gm.id) as Record<string, unknown>[];
    return { adventures: rows.map(toAdventureRow).map(summary) };
  });

  app.post('/api/adventures', async (req) => {
    const gm = requireGm(req);
    const body = parse(
      z.object({ name: z.string().trim().min(1).max(120), samples: z.boolean().optional() }),
      req.body,
    );
    const id = newId();
    db.prepare(
      'INSERT INTO adventures (id, gm_id, name, invite_token, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, gm.id, body.name, newId(18), Date.now());
    if (body.samples) await createSampleContent(db, config.dataDir, id);
    return { adventure: summary(getAdventure(db, id)!) };
  });

  app.patch('/api/adventures/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    ownAdventure(req, id);
    const { name } = parse(z.object({ name: z.string().trim().min(1).max(120) }), req.body);
    db.prepare('UPDATE adventures SET name = ? WHERE id = ?').run(name, id);
    const adv = getAdventure(db, id)!;
    rooms.broadcastEntity(id, 'adventure', {
      id,
      name: adv.name,
      activeSceneId: adv.activeSceneId,
      inviteToken: adv.inviteToken,
    });
    return { adventure: summary(adv) };
  });

  app.delete('/api/adventures/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    ownAdventure(req, id);
    rooms.closeWhere(id, () => true, 4404, 'Abenteuer gelöscht');
    db.prepare('DELETE FROM adventures WHERE id = ?').run(id);
    removeAdventureFiles(config.dataDir, id);
    return { ok: true };
  });

  app.post('/api/adventures/:id/invite', async (req) => {
    const { id } = parse(idParam, req.params);
    ownAdventure(req, id);
    db.prepare('UPDATE adventures SET invite_token = ? WHERE id = ?').run(newId(18), id);
    const adv = getAdventure(db, id)!;
    rooms.broadcastEntity(id, 'adventure', {
      id,
      name: adv.name,
      activeSceneId: adv.activeSceneId,
      inviteToken: adv.inviteToken,
    });
    return { adventure: summary(adv) };
  });

  /* ---------- Beitritt für Spieler ---------- */

  const byInvite = (token: string): AdventureRow => {
    const r = db.prepare('SELECT * FROM adventures WHERE invite_token = ?').get(token) as
      Record<string, unknown> | undefined;
    if (!r) fail(404, 'Dieser Einladungslink ist ungültig oder wurde erneuert.');
    return toAdventureRow(r);
  };

  app.get('/api/join/:token', async (req) => {
    const { token } = parse(z.object({ token: z.string().min(1).max(64) }), req.params);
    const adv = byInvite(token);
    const existing = playerFromToken(db, adv.id, req.cookies[playerCookie(adv.id)]);
    return { adventureId: adv.id, adventureName: adv.name, playerName: existing?.name ?? null };
  });

  app.post('/api/join/:token', async (req, reply) => {
    const { token } = parse(z.object({ token: z.string().min(1).max(64) }), req.params);
    const { name } = parse(z.object({ name: nameSchema }), req.body);
    const adv = byInvite(token);
    const existing = playerFromToken(db, adv.id, req.cookies[playerCookie(adv.id)]);
    if (existing) {
      db.prepare('UPDATE players SET name = ? WHERE id = ?').run(name, existing.id);
      const row = db.prepare('SELECT * FROM players WHERE id = ?').get(existing.id) as Record<
        string,
        unknown
      >;
      rooms.broadcastEntity(adv.id, 'player', { id: existing.id, name, color: String(row.color) });
      return { adventureId: adv.id };
    }
    const count = (
      db.prepare('SELECT COUNT(*) AS n FROM players WHERE adventure_id = ?').get(adv.id) as {
        n: number;
      }
    ).n;
    const id = newId();
    const secret = newId(32);
    const color = PLAYER_COLORS[Number(count) % PLAYER_COLORS.length]!;
    db.prepare(
      'INSERT INTO players (id, adventure_id, name, color, token, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, adv.id, name, color, secret, Date.now());
    reply.setCookie(playerCookie(adv.id), secret, { ...COOKIE_OPTS, maxAge: 365 * 86400 });
    rooms.broadcastEntity(adv.id, 'player', { id, name, color });
    return { adventureId: adv.id };
  });

  /** Wer bin ich in diesem Abenteuer? Spielleiter-Besitz geht vor Spieler-Cookie. */
  const viewerFor = (
    cookies: Record<string, string | undefined>,
    adventureId: string,
  ): Viewer | null => {
    const adv = getAdventure(db, adventureId);
    if (!adv) return null;
    const gm = gmFromSession(db, cookies[GM_COOKIE]);
    if (gm && gm.id === adv.gmId) return { role: 'gm', gmId: gm.id, name: gm.name };
    const p = playerFromToken(db, adventureId, cookies[playerCookie(adventureId)]);
    return p ? { role: 'player', playerId: p.id, name: p.name } : null;
  };

  app.get('/api/adventures/:id/access', async (req) => {
    const { id } = parse(idParam, req.params);
    const v = viewerFor(req.cookies, id);
    return { role: v?.role ?? null };
  });

  /* ---------- Dateien ---------- */

  app.post('/api/adventures/:id/assets', async (req) => {
    const { id } = parse(idParam, req.params);
    ownAdventure(req, id);
    const file = await req.file({
      limits: { fileSize: Math.max(config.maxImageBytes, config.maxAudioBytes) },
    });
    if (!file) fail(400, 'Keine Datei empfangen.');
    const buffer = await file.toBuffer();
    const isAudio = file.mimetype.startsWith('audio/');
    const limit = isAudio ? config.maxAudioBytes : config.maxImageBytes;
    if (buffer.length > limit)
      fail(413, `Die Datei ist zu groß (höchstens ${Math.round(limit / 1024 / 1024)} MB).`);
    const row = await storeAsset(db, config.dataDir, {
      adventureId: id,
      name: file.filename,
      mime: file.mimetype,
      buffer,
    });
    const asset = publicAsset(row);
    rooms.broadcastEntity(id, 'asset', asset);
    return { asset };
  });

  app.delete('/api/adventures/:id/assets/:assetId', async (req) => {
    const { id, assetId } = parse(
      z.object({ id: z.string().max(64), assetId: z.string().max(64) }),
      req.params,
    );
    const adv = ownAdventure(req, id);
    const row = getAssetRow(db, assetId);
    if (!row || row.adventureId !== id) fail(404, 'Datei nicht gefunden.');
    deleteAsset(db, config.dataDir, row);
    if (adv.audio.assetId === assetId) {
      const audio = {
        ...adv.audio,
        assetId: null,
        playing: false,
        position: 0,
        anchor: Date.now(),
      };
      db.prepare('UPDATE adventures SET audio = ? WHERE id = ?').run(JSON.stringify(audio), id);
    }
    // Verweise wurden entfernt: alle bekommen einen frischen Zustand.
    for (const c of rooms.connections(id)) rooms.sendSnapshot(c);
    return { ok: true };
  });

  app.get('/api/assets/:id', async (req, reply: FastifyReply) => {
    const { id } = parse(idParam, req.params);
    const row = getAssetRow(db, id);
    if (!row || !viewerFor(req.cookies, row.adventureId)) fail(404, 'Datei nicht gefunden.');
    const thumb = (req.query as Record<string, string | undefined>).thumb === '1' && row.thumb;
    reply.header('Cache-Control', 'private, max-age=31536000, immutable');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.type(thumb ? 'image/webp' : row.mime);
    return reply.sendFile(thumb || row.file);
  });

  /* ---------- Export / Import ---------- */

  app.get('/api/adventures/:id/export', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    ownAdventure(req, id);
    const result = exportAdventure(db, config.dataDir, id)!;
    const safe = result.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'abenteuer';
    reply.header('Content-Type', 'application/zip');
    reply.header(
      'Content-Disposition',
      `attachment; filename="vtt-export.zip"; filename*=UTF-8''${encodeURIComponent(safe)}.zip`,
    );
    return reply.send(Buffer.from(result.zip));
  });

  app.post('/api/import', async (req) => {
    const gm = requireGm(req);
    const file = await req.file();
    if (!file) fail(400, 'Keine Datei empfangen.');
    const buffer = await file.toBuffer();
    const id = await importAdventure(db, config.dataDir, gm.id, new Uint8Array(buffer), newId(18));
    return { adventure: summary(getAdventure(db, id)!) };
  });

  /* ---------- Gebauter Client (Produktion) ---------- */

  if (config.clientDir && fs.existsSync(config.clientDir)) {
    const clientDir = config.clientDir;
    await app.register(fastifyStatic, {
      root: clientDir,
      prefix: '/',
      decorateReply: false,
      wildcard: false,
      index: false,
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET' || req.url.startsWith('/api/') || req.url.startsWith('/ws')) {
        return reply.status(404).send({ error: 'Nicht gefunden.' });
      }
      return reply.type('text/html').send(fs.createReadStream(`${clientDir}/index.html`));
    });
  }

  /* ---------- Echtzeit (WebSocket) ---------- */

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  app.server.on('upgrade', (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws') return socket.destroy();
    if (config.production && req.headers.origin) {
      const originHost = (() => {
        try {
          return new URL(req.headers.origin!).host;
        } catch {
          return '';
        }
      })();
      const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host;
      if (originHost !== host) return socket.destroy();
    }
    const adventureId = url.searchParams.get('adventure') ?? '';
    const viewer = viewerFor(parseCookies(req.headers.cookie), adventureId);
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (!viewer) return ws.close(4401, 'Kein Zugang');
      attach(ws, { ws, viewer, adventureId });
    });
  });

  function attach(ws: WebSocket, conn: Conn) {
    let alive = true;
    let budget = 40;
    const refill = setInterval(() => (budget = Math.min(80, budget + 40)), 1000);
    const ping = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, 30_000);
    ws.on('pong', () => (alive = true));
    ws.on('close', () => {
      clearInterval(refill);
      clearInterval(ping);
      rooms.leave(conn);
    });
    ws.on('message', (raw) => {
      if (--budget < 0)
        return rooms.send(conn, { type: 'error', message: 'Zu viele Aktionen auf einmal.' });
      let data: unknown;
      try {
        data = JSON.parse(String(raw));
      } catch {
        return rooms.send(conn, { type: 'error', message: 'Ungültige Nachricht.' });
      }
      const parsed = clientMessage.safeParse(data);
      if (!parsed.success)
        return rooms.send(conn, { type: 'error', message: 'Ungültige Eingabe.' });
      try {
        handleAction(db, rooms, conn, parsed.data);
      } catch (err) {
        if (err instanceof ActionError)
          return rooms.send(conn, { type: 'error', message: err.message });
        app.log.error(err);
        rooms.send(conn, { type: 'error', message: 'Interner Fehler.' });
      }
    });
    rooms.join(conn);
  }

  app.addHook('onClose', async () => {
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    db.close();
  });

  return { app, db, rooms };
}

export type { Snapshot };
