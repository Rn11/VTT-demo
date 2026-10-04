import type { RollResult } from './dice';

export type Role = 'gm' | 'player';

export interface Adventure {
  id: string;
  name: string;
  activeSceneId: string | null;
  /** Nur für den Spielleiter sichtbar. */
  inviteToken?: string;
}

export interface Player {
  id: string;
  name: string;
  color: string;
}

export interface Scene {
  id: string;
  name: string;
  mapAssetId: string | null;
  mapWidth: number;
  mapHeight: number;
  gridSize: number;
  gridVisible: boolean;
  sort: number;
}

export interface Token {
  id: string;
  sceneId: string;
  name: string;
  assetId: string | null;
  color: string;
  x: number;
  y: number;
  /** Größe in Rasterfeldern (1 = ein Feld). */
  size: number;
  hidden: boolean;
  ownerPlayerId: string | null;
}

export type HandoutVisibility = 'none' | 'all' | 'some';

export interface Handout {
  id: string;
  title: string;
  body: string;
  assetId: string | null;
  visibility: HandoutVisibility;
  /** Nur für den Spielleiter sichtbar (bei Spielern leer). */
  playerIds: string[];
  updatedAt: number;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  sceneId: string | null;
  updatedAt: number;
}

export interface CustomField {
  label: string;
  value: string;
}

export interface Character {
  id: string;
  name: string;
  templateId: string;
  values: Record<string, string | number | boolean>;
  custom: CustomField[];
  /** null = Nichtspielercharakter, nur für den Spielleiter sichtbar. */
  ownerPlayerId: string | null;
}

export type AssetKind = 'image' | 'audio';

export interface Asset {
  id: string;
  kind: AssetKind;
  name: string;
  mime: string;
  width: number | null;
  height: number | null;
}

export type MessageKind = 'chat' | 'roll' | 'system';

export interface Message {
  id: string;
  kind: MessageKind;
  authorId: string;
  authorName: string;
  /** Charakter, als der gesprochen/gewürfelt wurde. */
  characterName: string | null;
  text: string;
  roll: RollResult | null;
  /** Zielwert eines Prozentwurfs. */
  target: number | null;
  hidden: boolean;
  createdAt: number;
}

export interface AudioState {
  assetId: string | null;
  playing: boolean;
  loop: boolean;
  volume: number;
  /** Abspielposition in Sekunden zum Zeitpunkt `anchor`. */
  position: number;
  /** Serverzeit (ms) zu der `position` galt. */
  anchor: number;
}

export interface Me {
  role: Role;
  playerId: string | null;
  name: string;
}

export interface Snapshot {
  adventure: Adventure;
  me: Me;
  players: Player[];
  scenes: Scene[];
  tokens: Token[];
  handouts: Handout[];
  notes: Note[];
  characters: Character[];
  assets: Asset[];
  messages: Message[];
  audio: AudioState;
  online: string[];
  serverTime: number;
}

export interface EntityMap {
  adventure: Adventure;
  player: Player;
  scene: Scene;
  token: Token;
  handout: Handout;
  note: Note;
  character: Character;
  asset: Asset;
}

export type EntityKind = keyof EntityMap;

export type ServerMessage =
  | { type: 'snapshot'; state: Snapshot }
  | { [K in EntityKind]: { type: 'upsert'; kind: K; item: EntityMap[K] } }[EntityKind]
  | { type: 'remove'; kind: EntityKind; id: string }
  | { type: 'message'; item: Message }
  | { type: 'audio'; state: AudioState; serverTime: number }
  | { type: 'sfx'; assetId: string; volume: number }
  | { type: 'presence'; online: string[] }
  | { type: 'error'; message: string };
