import { randomInt } from 'node:crypto';
import {
  DiceError,
  PLAYER_ACTIONS,
  isTemplateId,
  rollDice,
  type AudioState,
  type ClientMessage,
  type Message,
} from '@vtt/shared';
import type { Db } from './db';
import { newId } from './db';
import {
  getAdventure,
  getAssetRow,
  getOne,
  toCharacter,
  toHandout,
  toNote,
  toScene,
  toToken,
  type AdventureRow,
} from './repo';
import type { Conn, Rooms } from './rooms';

export class ActionError extends Error {}

interface Ctx {
  db: Db;
  rooms: Rooms;
  conn: Conn;
  adv: AdventureRow;
}

const deny = (): never => {
  throw new ActionError('Dafür fehlt dir die Berechtigung.');
};
const notFound = (what: string): never => {
  throw new ActionError(`${what} nicht gefunden.`);
};

function requireAsset(ctx: Ctx, id: string, kind: 'image' | 'audio') {
  const a = getAssetRow(ctx.db, id);
  if (!a || a.adventureId !== ctx.adv.id || a.kind !== kind)
    notFound(kind === 'image' ? 'Bild' : 'Audiodatei');
  return a!;
}

function requirePlayer(ctx: Ctx, id: string | null): void {
  if (id === null) return;
  const r = ctx.db
    .prepare('SELECT 1 FROM players WHERE id = ? AND adventure_id = ?')
    .get(id, ctx.adv.id);
  if (!r) notFound('Spieler');
}

/** Baut ein UPDATE nur für die übergebenen Felder. */
function update(db: Db, table: string, id: string, fields: Record<string, unknown>): void {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  const sql = `UPDATE ${table} SET ${entries.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...(entries.map(([, v]) => v) as (string | number | null)[]), id);
}

const bool = (v: boolean | undefined) => (v === undefined ? undefined : v ? 1 : 0);

function currentPosition(a: AudioState, now: number): number {
  return a.playing ? a.position + (now - a.anchor) / 1000 : a.position;
}

function saveAudio(ctx: Ctx, state: AudioState): void {
  ctx.db
    .prepare('UPDATE adventures SET audio = ? WHERE id = ?')
    .run(JSON.stringify(state), ctx.adv.id);
  ctx.rooms.broadcastAudio(ctx.adv.id, state);
}

function addMessage(
  ctx: Ctx,
  m: Omit<Message, 'id' | 'createdAt' | 'authorId' | 'authorName'>,
): void {
  const v = ctx.conn.viewer;
  const msg: Message = {
    ...m,
    id: newId(),
    createdAt: Date.now(),
    authorId: v.role === 'gm' ? 'gm' : v.playerId,
    authorName: v.name,
  };
  ctx.db
    .prepare(
      'INSERT INTO messages (id, adventure_id, kind, author_id, author_name, text, roll, hidden, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      msg.id,
      ctx.adv.id,
      msg.kind,
      msg.authorId,
      msg.authorName,
      msg.text,
      msg.roll ? JSON.stringify(msg.roll) : null,
      msg.hidden ? 1 : 0,
      msg.createdAt,
    );
  ctx.rooms.broadcastMessage(ctx.adv.id, msg);
}

export function handleAction(db: Db, rooms: Rooms, conn: Conn, msg: ClientMessage): void {
  const adv = getAdventure(db, conn.adventureId);
  if (!adv) throw new ActionError('Abenteuer nicht gefunden.');
  const isGm = conn.viewer.role === 'gm';
  if (!isGm && !PLAYER_ACTIONS.has(msg.type)) deny();
  const ctx: Ctx = { db, rooms, conn, adv };
  const playerId = conn.viewer.role === 'player' ? conn.viewer.playerId : null;
  const advId = adv.id;

  const scene = (id: string) => getOne(db, 'scenes', toScene, id, advId) ?? notFound('Szene');
  const token = (id: string) => getOne(db, 'tokens', toToken, id, advId) ?? notFound('Spielfigur');
  const handout = (id: string) =>
    getOne(db, 'handouts', toHandout, id, advId) ?? notFound('Handout');
  const note = (id: string) => getOne(db, 'notes', toNote, id, advId) ?? notFound('Notiz');
  const character = (id: string) =>
    getOne(db, 'characters', toCharacter, id, advId) ?? notFound('Charakter');

  const setActiveScene = (id: string | null) => {
    db.prepare('UPDATE adventures SET active_scene_id = ? WHERE id = ?').run(id, advId);
    const updated = getAdventure(db, advId)!;
    rooms.broadcastEntity(advId, 'adventure', {
      id: updated.id,
      name: updated.name,
      activeSceneId: updated.activeSceneId,
      inviteToken: updated.inviteToken,
    });
    rooms.resyncPlayers(advId);
  };

  switch (msg.type) {
    case 'scene.create': {
      const id = newId();
      const max = db
        .prepare('SELECT COALESCE(MAX(sort), -1) AS m FROM scenes WHERE adventure_id = ?')
        .get(advId) as { m: number };
      db.prepare('INSERT INTO scenes (id, adventure_id, name, sort) VALUES (?, ?, ?, ?)').run(
        id,
        advId,
        msg.name,
        Number(max.m) + 1,
      );
      rooms.broadcastEntity(advId, 'scene', scene(id));
      if (!adv.activeSceneId) setActiveScene(id);
      return;
    }
    case 'scene.update': {
      scene(msg.id);
      const fields: Record<string, unknown> = {
        name: msg.name,
        grid_size: msg.gridSize,
        grid_visible: bool(msg.gridVisible),
      };
      if (msg.mapAssetId !== undefined) {
        fields.map_asset_id = msg.mapAssetId;
        if (msg.mapAssetId) {
          const a = requireAsset(ctx, msg.mapAssetId, 'image');
          fields.map_width = a.width ?? 2000;
          fields.map_height = a.height ?? 1400;
        }
      }
      update(db, 'scenes', msg.id, fields);
      rooms.broadcastEntity(advId, 'scene', scene(msg.id));
      return;
    }
    case 'scene.delete': {
      scene(msg.id);
      const tokenIds = (
        db.prepare('SELECT id FROM tokens WHERE scene_id = ?').all(msg.id) as { id: string }[]
      ).map((r) => String(r.id));
      db.prepare('UPDATE notes SET scene_id = NULL WHERE scene_id = ?').run(msg.id);
      db.prepare('DELETE FROM scenes WHERE id = ?').run(msg.id);
      for (const t of tokenIds) rooms.broadcastRemove(advId, 'token', t);
      rooms.broadcastRemove(advId, 'scene', msg.id);
      if (adv.activeSceneId === msg.id) {
        const next = db
          .prepare('SELECT id FROM scenes WHERE adventure_id = ? ORDER BY sort LIMIT 1')
          .get(advId) as { id: string } | undefined;
        setActiveScene(next ? String(next.id) : null);
      }
      return;
    }
    case 'scene.activate': {
      scene(msg.id);
      setActiveScene(msg.id);
      return;
    }

    case 'token.create': {
      scene(msg.sceneId);
      if (msg.assetId) requireAsset(ctx, msg.assetId, 'image');
      requirePlayer(ctx, msg.ownerPlayerId);
      const id = newId();
      db.prepare(
        'INSERT INTO tokens (id, adventure_id, scene_id, name, asset_id, color, x, y, size, hidden, owner_player_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        id,
        advId,
        msg.sceneId,
        msg.name,
        msg.assetId,
        msg.color,
        msg.x,
        msg.y,
        msg.size,
        msg.hidden ? 1 : 0,
        msg.ownerPlayerId,
      );
      rooms.broadcastEntity(advId, 'token', token(id));
      return;
    }
    case 'token.update': {
      token(msg.id);
      if (msg.assetId) requireAsset(ctx, msg.assetId, 'image');
      if (msg.ownerPlayerId !== undefined) requirePlayer(ctx, msg.ownerPlayerId);
      update(db, 'tokens', msg.id, {
        name: msg.name,
        asset_id: msg.assetId,
        color: msg.color,
        size: msg.size,
        hidden: bool(msg.hidden),
        owner_player_id: msg.ownerPlayerId,
      });
      rooms.broadcastEntity(advId, 'token', token(msg.id));
      return;
    }
    case 'token.move': {
      const t = token(msg.id);
      if (!isGm && (t.ownerPlayerId !== playerId || t.hidden || t.sceneId !== adv.activeSceneId))
        deny();
      update(db, 'tokens', msg.id, { x: msg.x, y: msg.y });
      rooms.broadcastEntity(advId, 'token', { ...t, x: msg.x, y: msg.y });
      return;
    }
    case 'token.delete': {
      token(msg.id);
      db.prepare('DELETE FROM tokens WHERE id = ?').run(msg.id);
      rooms.broadcastRemove(advId, 'token', msg.id);
      return;
    }

    case 'handout.create': {
      if (msg.assetId) requireAsset(ctx, msg.assetId, 'image');
      const id = newId();
      db.prepare(
        'INSERT INTO handouts (id, adventure_id, title, body, asset_id, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(id, advId, msg.title, msg.body, msg.assetId, Date.now());
      rooms.broadcastEntity(advId, 'handout', handout(id));
      return;
    }
    case 'handout.update': {
      handout(msg.id);
      if (msg.assetId) requireAsset(ctx, msg.assetId, 'image');
      let playerIds: string | undefined;
      if (msg.playerIds) {
        for (const p of msg.playerIds) requirePlayer(ctx, p);
        playerIds = JSON.stringify([...new Set(msg.playerIds)]);
      }
      update(db, 'handouts', msg.id, {
        title: msg.title,
        body: msg.body,
        asset_id: msg.assetId,
        visibility: msg.visibility,
        player_ids: playerIds,
        updated_at: Date.now(),
      });
      rooms.broadcastEntity(advId, 'handout', handout(msg.id));
      return;
    }
    case 'handout.delete': {
      handout(msg.id);
      db.prepare('DELETE FROM handouts WHERE id = ?').run(msg.id);
      rooms.broadcastRemove(advId, 'handout', msg.id);
      return;
    }

    case 'note.create': {
      if (msg.sceneId) scene(msg.sceneId);
      const id = newId();
      db.prepare(
        'INSERT INTO notes (id, adventure_id, title, body, scene_id, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(id, advId, msg.title, msg.body, msg.sceneId, Date.now());
      rooms.broadcastEntity(advId, 'note', note(id));
      return;
    }
    case 'note.update': {
      note(msg.id);
      if (msg.sceneId) scene(msg.sceneId);
      update(db, 'notes', msg.id, {
        title: msg.title,
        body: msg.body,
        scene_id: msg.sceneId,
        updated_at: Date.now(),
      });
      rooms.broadcastEntity(advId, 'note', note(msg.id));
      return;
    }
    case 'note.delete': {
      note(msg.id);
      db.prepare('DELETE FROM notes WHERE id = ?').run(msg.id);
      rooms.broadcastRemove(advId, 'note', msg.id);
      return;
    }

    case 'character.create': {
      if (!isTemplateId(msg.templateId)) throw new ActionError('Unbekannte Bogenvorlage.');
      const owner = isGm ? msg.ownerPlayerId : playerId;
      requirePlayer(ctx, owner);
      const id = newId();
      db.prepare(
        'INSERT INTO characters (id, adventure_id, name, template_id, owner_player_id) VALUES (?, ?, ?, ?, ?)',
      ).run(id, advId, msg.name, msg.templateId, owner);
      rooms.broadcastEntity(advId, 'character', character(id));
      return;
    }
    case 'character.update': {
      const c = character(msg.id);
      if (!isGm && (c.ownerPlayerId !== playerId || msg.ownerPlayerId !== undefined)) deny();
      if (msg.ownerPlayerId !== undefined) requirePlayer(ctx, msg.ownerPlayerId);
      let data: string | undefined;
      if (msg.values) {
        const merged = { ...c.values, ...msg.values };
        if (Object.keys(merged).length > 300) throw new ActionError('Zu viele Felder.');
        data = JSON.stringify(merged);
      }
      update(db, 'characters', msg.id, {
        name: msg.name,
        data,
        custom: msg.custom ? JSON.stringify(msg.custom) : undefined,
        owner_player_id: msg.ownerPlayerId,
      });
      const after = character(msg.id);
      rooms.broadcastEntity(advId, 'character', after);
      // Wird ein Spieler-Charakter zum NSC, verschwindet er bei den Spielern (visibleEntity liefert null).
      return;
    }
    case 'character.delete': {
      character(msg.id);
      db.prepare('DELETE FROM characters WHERE id = ?').run(msg.id);
      rooms.broadcastRemove(advId, 'character', msg.id);
      return;
    }

    case 'chat.send': {
      const text = msg.text.trim();
      if (!text) return;
      addMessage(ctx, { kind: 'chat', text, roll: null, hidden: false });
      return;
    }
    case 'dice.roll': {
      try {
        const roll = rollDice(msg.expression, (sides) => randomInt(1, sides + 1));
        addMessage(ctx, {
          kind: 'roll',
          text: msg.label?.trim() ?? '',
          roll,
          hidden: Boolean(msg.hidden),
        });
      } catch (err) {
        if (err instanceof DiceError) throw new ActionError(`Würfelausdruck: ${err.message}`);
        throw err;
      }
      return;
    }

    case 'audio.play': {
      requireAsset(ctx, msg.assetId, 'audio');
      saveAudio(ctx, {
        ...adv.audio,
        assetId: msg.assetId,
        playing: true,
        loop: msg.loop,
        position: 0,
        anchor: Date.now(),
      });
      return;
    }
    case 'audio.pause': {
      if (!adv.audio.playing) return;
      const now = Date.now();
      saveAudio(ctx, {
        ...adv.audio,
        playing: false,
        position: currentPosition(adv.audio, now),
        anchor: now,
      });
      return;
    }
    case 'audio.resume': {
      if (adv.audio.playing || !adv.audio.assetId) return;
      saveAudio(ctx, { ...adv.audio, playing: true, anchor: Date.now() });
      return;
    }
    case 'audio.stop': {
      saveAudio(ctx, {
        ...adv.audio,
        assetId: null,
        playing: false,
        position: 0,
        anchor: Date.now(),
      });
      return;
    }
    case 'audio.loop': {
      const now = Date.now();
      saveAudio(ctx, {
        ...adv.audio,
        loop: msg.loop,
        position: currentPosition(adv.audio, now),
        anchor: now,
      });
      return;
    }
    case 'audio.volume': {
      const now = Date.now();
      saveAudio(ctx, {
        ...adv.audio,
        volume: msg.volume,
        position: currentPosition(adv.audio, now),
        anchor: now,
      });
      return;
    }
    case 'sfx.play': {
      requireAsset(ctx, msg.assetId, 'audio');
      rooms.broadcastSfx(advId, msg.assetId, msg.volume);
      return;
    }
  }
}
