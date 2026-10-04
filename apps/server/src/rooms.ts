import type { WebSocket } from 'ws';
import type { AudioState, EntityKind, EntityMap, Message, ServerMessage } from '@vtt/shared';
import type { Db } from './db';
import { getAdventure, loadAdventureData } from './repo';
import { buildSnapshot, visibleEntity, visibleMessage, type Viewer } from './visibility';

export interface Conn {
  ws: WebSocket;
  viewer: Viewer;
  adventureId: string;
}

/** Verwaltet die offenen Verbindungen je Abenteuer und verteilt Änderungen gefiltert pro Empfänger. */
export class Rooms {
  private rooms = new Map<string, Set<Conn>>();

  constructor(private db: Db) {}

  join(conn: Conn): void {
    let set = this.rooms.get(conn.adventureId);
    if (!set) this.rooms.set(conn.adventureId, (set = new Set()));
    set.add(conn);
    this.sendSnapshot(conn);
    this.broadcastPresence(conn.adventureId);
  }

  leave(conn: Conn): void {
    const set = this.rooms.get(conn.adventureId);
    if (!set) return;
    set.delete(conn);
    if (set.size === 0) this.rooms.delete(conn.adventureId);
    else this.broadcastPresence(conn.adventureId);
  }

  connections(adventureId: string): Conn[] {
    return [...(this.rooms.get(adventureId) ?? [])];
  }

  online(adventureId: string): string[] {
    const ids = new Set<string>();
    for (const c of this.connections(adventureId))
      ids.add(c.viewer.role === 'gm' ? 'gm' : c.viewer.playerId);
    return [...ids];
  }

  send(conn: Conn, msg: ServerMessage): void {
    if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(msg));
  }

  sendSnapshot(conn: Conn): void {
    const data = loadAdventureData(this.db, conn.adventureId);
    if (!data) {
      conn.ws.close(4404, 'Abenteuer nicht gefunden');
      return;
    }
    this.send(conn, {
      type: 'snapshot',
      state: buildSnapshot(data, conn.viewer, this.online(conn.adventureId), Date.now()),
    });
  }

  /** Neuer Gesamtzustand für alle Spieler (z. B. nach Szenenwechsel). */
  resyncPlayers(adventureId: string): void {
    for (const c of this.connections(adventureId))
      if (c.viewer.role === 'player') this.sendSnapshot(c);
  }

  /** Sendet je Empfänger entweder die (gefilterte) Fassung oder eine Entfernung. */
  broadcastEntity<K extends EntityKind>(adventureId: string, kind: K, item: EntityMap[K]): void {
    const adv = getAdventure(this.db, adventureId);
    const ctx = { activeSceneId: adv?.activeSceneId ?? null };
    for (const c of this.connections(adventureId)) {
      const v = visibleEntity(c.viewer, kind, item, ctx);
      if (v) this.send(c, { type: 'upsert', kind, item: v } as ServerMessage);
      else this.send(c, { type: 'remove', kind, id: item.id });
    }
  }

  broadcastRemove(adventureId: string, kind: EntityKind, id: string): void {
    for (const c of this.connections(adventureId)) this.send(c, { type: 'remove', kind, id });
  }

  broadcastMessage(adventureId: string, message: Message): void {
    for (const c of this.connections(adventureId)) {
      const v = visibleMessage(c.viewer, message);
      if (v) this.send(c, { type: 'message', item: v });
    }
  }

  broadcastAudio(adventureId: string, state: AudioState): void {
    for (const c of this.connections(adventureId))
      this.send(c, { type: 'audio', state, serverTime: Date.now() });
  }

  broadcastSfx(adventureId: string, assetId: string, volume: number): void {
    for (const c of this.connections(adventureId)) this.send(c, { type: 'sfx', assetId, volume });
  }

  broadcastPresence(adventureId: string): void {
    const online = this.online(adventureId);
    for (const c of this.connections(adventureId)) this.send(c, { type: 'presence', online });
  }

  /** Schließt Verbindungen, z. B. wenn ein Abenteuer gelöscht oder der Einladungslink erneuert wurde. */
  closeWhere(adventureId: string, pred: (c: Conn) => boolean, code: number, reason: string): void {
    for (const c of this.connections(adventureId)) if (pred(c)) c.ws.close(code, reason);
  }
}
