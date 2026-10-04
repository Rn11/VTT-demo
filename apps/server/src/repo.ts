import type {
  Adventure,
  Asset,
  AudioState,
  Character,
  CustomField,
  Handout,
  HandoutVisibility,
  Message,
  Note,
  Player,
  RollResult,
  Scene,
  Token,
} from '@vtt/shared';
import type { Db } from './db';

/* Zeilen aus SQLite haben einen null-Prototyp; wir lesen sie über diese Hilfstypen. */
type Row = Record<string, unknown>;

const str = (v: unknown) => String(v);
const strOrNull = (v: unknown) => (v === null || v === undefined ? null : String(v));
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function parseJson<T>(v: unknown, fallback: T): T {
  try {
    return typeof v === 'string' ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export interface AdventureRow {
  id: string;
  gmId: string;
  name: string;
  inviteToken: string;
  activeSceneId: string | null;
  audio: AudioState;
}

export const DEFAULT_AUDIO: AudioState = {
  assetId: null,
  playing: false,
  loop: true,
  volume: 0.6,
  position: 0,
  anchor: 0,
};

export function toAdventureRow(r: Row): AdventureRow {
  return {
    id: str(r.id),
    gmId: str(r.gm_id),
    name: str(r.name),
    inviteToken: str(r.invite_token),
    activeSceneId: strOrNull(r.active_scene_id),
    audio: { ...DEFAULT_AUDIO, ...parseJson<Partial<AudioState>>(r.audio, {}) },
  };
}

export function toAdventure(a: AdventureRow): Adventure {
  return { id: a.id, name: a.name, activeSceneId: a.activeSceneId, inviteToken: a.inviteToken };
}

export const toPlayer = (r: Row): Player => ({
  id: str(r.id),
  name: str(r.name),
  color: str(r.color),
});

export const toScene = (r: Row): Scene => ({
  id: str(r.id),
  name: str(r.name),
  mapAssetId: strOrNull(r.map_asset_id),
  mapWidth: Number(r.map_width),
  mapHeight: Number(r.map_height),
  gridSize: Number(r.grid_size),
  gridVisible: Boolean(r.grid_visible),
  sort: Number(r.sort),
});

export const toToken = (r: Row): Token => ({
  id: str(r.id),
  sceneId: str(r.scene_id),
  name: str(r.name),
  assetId: strOrNull(r.asset_id),
  color: str(r.color),
  x: Number(r.x),
  y: Number(r.y),
  size: Number(r.size),
  hidden: Boolean(r.hidden),
  ownerPlayerId: strOrNull(r.owner_player_id),
});

export const toHandout = (r: Row): Handout => ({
  id: str(r.id),
  title: str(r.title),
  body: str(r.body),
  assetId: strOrNull(r.asset_id),
  visibility: str(r.visibility) as HandoutVisibility,
  playerIds: parseJson<string[]>(r.player_ids, []),
  updatedAt: Number(r.updated_at),
});

export const toNote = (r: Row): Note => ({
  id: str(r.id),
  title: str(r.title),
  body: str(r.body),
  sceneId: strOrNull(r.scene_id),
  updatedAt: Number(r.updated_at),
});

export const toCharacter = (r: Row): Character => ({
  id: str(r.id),
  name: str(r.name),
  templateId: str(r.template_id),
  values: parseJson<Character['values']>(r.data, {}),
  custom: parseJson<CustomField[]>(r.custom, []),
  ownerPlayerId: strOrNull(r.owner_player_id),
});

export interface AssetRow extends Asset {
  adventureId: string;
  file: string;
  thumb: string | null;
}

export const toAssetRow = (r: Row): AssetRow => ({
  id: str(r.id),
  adventureId: str(r.adventure_id),
  kind: str(r.kind) as Asset['kind'],
  name: str(r.name),
  mime: str(r.mime),
  file: str(r.file),
  thumb: strOrNull(r.thumb),
  width: numOrNull(r.width),
  height: numOrNull(r.height),
});

export const toAsset = (a: AssetRow): Asset => ({
  id: a.id,
  kind: a.kind,
  name: a.name,
  mime: a.mime,
  width: a.width,
  height: a.height,
});

export const toMessage = (r: Row): Message => ({
  id: str(r.id),
  kind: str(r.kind) as Message['kind'],
  authorId: str(r.author_id),
  authorName: str(r.author_name),
  characterName: strOrNull(r.character_name),
  text: str(r.text),
  roll: parseJson<RollResult | null>(r.roll, null),
  target: numOrNull(r.target),
  hidden: Boolean(r.hidden),
  createdAt: Number(r.created_at),
});

/** Kompletter Rohzustand eines Abenteuers (ungefiltert). */
export interface AdventureData {
  adventure: AdventureRow;
  players: Player[];
  scenes: Scene[];
  tokens: Token[];
  handouts: Handout[];
  notes: Note[];
  characters: Character[];
  assets: Asset[];
  messages: Message[];
}

export const MESSAGE_HISTORY = 200;

export function getAdventure(db: Db, id: string): AdventureRow | null {
  const r = db.prepare('SELECT * FROM adventures WHERE id = ?').get(id) as Row | undefined;
  return r ? toAdventureRow(r) : null;
}

export function loadAdventureData(db: Db, id: string): AdventureData | null {
  const adventure = getAdventure(db, id);
  if (!adventure) return null;
  const all = (sql: string) => db.prepare(sql).all(id) as Row[];
  return {
    adventure,
    players: all('SELECT * FROM players WHERE adventure_id = ? ORDER BY created_at').map(toPlayer),
    scenes: all('SELECT * FROM scenes WHERE adventure_id = ? ORDER BY sort, rowid').map(toScene),
    tokens: all('SELECT * FROM tokens WHERE adventure_id = ? ORDER BY rowid').map(toToken),
    handouts: all('SELECT * FROM handouts WHERE adventure_id = ? ORDER BY updated_at DESC').map(
      toHandout,
    ),
    notes: all('SELECT * FROM notes WHERE adventure_id = ? ORDER BY updated_at DESC').map(toNote),
    characters: all('SELECT * FROM characters WHERE adventure_id = ? ORDER BY rowid').map(
      toCharacter,
    ),
    assets: all('SELECT * FROM assets WHERE adventure_id = ? ORDER BY created_at')
      .map(toAssetRow)
      .map(toAsset),
    messages: (
      db
        .prepare(
          'SELECT * FROM messages WHERE adventure_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?',
        )
        .all(id, MESSAGE_HISTORY) as Row[]
    )
      .map(toMessage)
      .reverse(),
  };
}

export function getOne<T>(
  db: Db,
  table: string,
  map: (r: Row) => T,
  id: string,
  adventureId: string,
): T | null {
  const r = db
    .prepare(`SELECT * FROM ${table} WHERE id = ? AND adventure_id = ?`)
    .get(id, adventureId) as Row | undefined;
  return r ? map(r) : null;
}

export function getAssetRow(db: Db, id: string): AssetRow | null {
  const r = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as Row | undefined;
  return r ? toAssetRow(r) : null;
}
