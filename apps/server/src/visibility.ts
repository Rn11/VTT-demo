import type { Adventure, EntityKind, EntityMap, Message, Snapshot } from '@vtt/shared';
import type { AdventureData } from './repo';
import { toAdventure } from './repo';

/**
 * Wer schaut zu? Der Spielleiter sieht alles, Spieler nur das Freigegebene.
 * Alles, was hier `null` liefert, verlässt den Server nicht in Richtung dieses Betrachters.
 */
export type Viewer =
  { role: 'gm'; gmId: string; name: string } | { role: 'player'; playerId: string; name: string };

export interface VisibilityContext {
  activeSceneId: string | null;
}

export function visibleEntity<K extends EntityKind>(
  viewer: Viewer,
  kind: K,
  item: EntityMap[K],
  ctx: VisibilityContext,
): EntityMap[K] | null {
  if (viewer.role === 'gm') return item;
  switch (kind) {
    case 'adventure': {
      const { inviteToken: _hidden, ...rest } = item as Adventure;
      return rest as EntityMap[K];
    }
    case 'player':
      return item;
    case 'scene':
      return (item as EntityMap['scene']).id === ctx.activeSceneId ? item : null;
    case 'token': {
      const t = item as EntityMap['token'];
      return !t.hidden && t.sceneId === ctx.activeSceneId ? item : null;
    }
    case 'handout': {
      const h = item as EntityMap['handout'];
      const visible =
        h.visibility === 'all' ||
        (h.visibility === 'some' && h.playerIds.includes(viewer.playerId));
      return visible ? ({ ...h, playerIds: [] } as unknown as EntityMap[K]) : null;
    }
    case 'note':
      return null;
    case 'character':
      return (item as EntityMap['character']).ownerPlayerId ? item : null;
    case 'asset':
      return null;
    default:
      return null;
  }
}

export function visibleMessage(viewer: Viewer, m: Message): Message | null {
  if (!m.hidden || viewer.role === 'gm') return m;
  return m.authorId === viewer.playerId ? m : null;
}

function filterList<K extends EntityKind>(
  viewer: Viewer,
  kind: K,
  items: EntityMap[K][],
  ctx: VisibilityContext,
): EntityMap[K][] {
  const out: EntityMap[K][] = [];
  for (const item of items) {
    const v = visibleEntity(viewer, kind, item, ctx);
    if (v) out.push(v);
  }
  return out;
}

export function buildSnapshot(
  data: AdventureData,
  viewer: Viewer,
  online: string[],
  now: number,
): Snapshot {
  const ctx: VisibilityContext = { activeSceneId: data.adventure.activeSceneId };
  const adventure = visibleEntity(viewer, 'adventure', toAdventure(data.adventure), ctx)!;
  return {
    adventure,
    me:
      viewer.role === 'gm'
        ? { role: 'gm', playerId: null, name: viewer.name }
        : { role: 'player', playerId: viewer.playerId, name: viewer.name },
    players: filterList(viewer, 'player', data.players, ctx),
    scenes: filterList(viewer, 'scene', data.scenes, ctx),
    tokens: filterList(viewer, 'token', data.tokens, ctx),
    handouts: filterList(viewer, 'handout', data.handouts, ctx),
    notes: filterList(viewer, 'note', data.notes, ctx),
    characters: filterList(viewer, 'character', data.characters, ctx),
    assets: filterList(viewer, 'asset', data.assets, ctx),
    messages: data.messages
      .map((m) => visibleMessage(viewer, m))
      .filter((m): m is Message => m !== null),
    audio: data.adventure.audio,
    online,
    serverTime: now,
  };
}
