import { create } from 'zustand';
import type {
  Adventure,
  Asset,
  AudioState,
  Character,
  EntityKind,
  Handout,
  Me,
  Message,
  Note,
  Player,
  Scene,
  ServerMessage,
  Token,
} from '@vtt/shared';

export type Status = 'idle' | 'connecting' | 'online' | 'offline' | 'denied' | 'gone';

type Rec<T> = Record<string, T>;

export interface GameState {
  status: Status;
  me: Me | null;
  adventure: Adventure | null;
  players: Rec<Player>;
  scenes: Rec<Scene>;
  tokens: Rec<Token>;
  handouts: Rec<Handout>;
  notes: Rec<Note>;
  characters: Rec<Character>;
  assets: Rec<Asset>;
  messages: Message[];
  audio: AudioState | null;
  online: string[];
  /** serverzeit − lokale Zeit in ms */
  serverOffset: number;
  errors: { id: number; text: string }[];
  /** Handouts, die seit dem letzten Öffnen des Reiters neu sichtbar wurden. */
  unseenHandouts: string[];
  /** Lokal: welche Szene der Spielleiter gerade bearbeitet. */
  viewSceneId: string | null;
  selectedTokenId: string | null;
  sfx: { assetId: string; volume: number; n: number } | null;

  apply(msg: ServerMessage): void;
  setStatus(s: Status): void;
  dismissError(id: number): void;
  markHandoutsSeen(): void;
  setViewScene(id: string | null): void;
  selectToken(id: string | null): void;
  /** Optimistische Bewegung während des Ziehens. */
  moveTokenLocal(id: string, x: number, y: number): void;
  reset(): void;
}

const byId = <T extends { id: string }>(items: T[]): Rec<T> =>
  Object.fromEntries(items.map((i) => [i.id, i]));

const keyOf: Record<Exclude<EntityKind, 'adventure'>, keyof GameState> = {
  player: 'players',
  scene: 'scenes',
  token: 'tokens',
  handout: 'handouts',
  note: 'notes',
  character: 'characters',
  asset: 'assets',
};

let errorSeq = 0;

const empty = {
  status: 'idle' as Status,
  me: null,
  adventure: null,
  players: {},
  scenes: {},
  tokens: {},
  handouts: {},
  notes: {},
  characters: {},
  assets: {},
  messages: [],
  audio: null,
  online: [],
  serverOffset: 0,
  errors: [],
  unseenHandouts: [],
  viewSceneId: null,
  selectedTokenId: null,
  sfx: null,
};

export const useGame = create<GameState>((set, get) => ({
  ...empty,

  apply(msg) {
    switch (msg.type) {
      case 'snapshot': {
        const s = msg.state;
        const prev = get();
        const known = new Set(Object.keys(prev.handouts));
        const unseen =
          s.me.role === 'player' && prev.me
            ? s.handouts.filter((h) => !known.has(h.id)).map((h) => h.id)
            : [];
        const viewSceneId =
          s.me.role === 'gm' && prev.viewSceneId && s.scenes.some((x) => x.id === prev.viewSceneId)
            ? prev.viewSceneId
            : s.adventure.activeSceneId;
        set({
          status: 'online',
          me: s.me,
          adventure: s.adventure,
          players: byId(s.players),
          scenes: byId(s.scenes),
          tokens: byId(s.tokens),
          handouts: byId(s.handouts),
          notes: byId(s.notes),
          characters: byId(s.characters),
          assets: byId(s.assets),
          messages: s.messages,
          audio: s.audio,
          online: s.online,
          serverOffset: s.serverTime - Date.now(),
          viewSceneId,
          unseenHandouts: [...new Set([...prev.unseenHandouts, ...unseen])],
          selectedTokenId:
            prev.selectedTokenId && s.tokens.some((x) => x.id === prev.selectedTokenId)
              ? prev.selectedTokenId
              : null,
        });
        return;
      }
      case 'upsert': {
        if (msg.kind === 'adventure') {
          const adv = msg.item;
          const st = get();
          set({
            adventure: adv,
            viewSceneId:
              st.me?.role === 'gm' ? (st.viewSceneId ?? adv.activeSceneId) : adv.activeSceneId,
          });
          return;
        }
        const key = keyOf[msg.kind];
        const current = get()[key] as Rec<{ id: string }>;
        const patch: Partial<GameState> = {
          [key]: { ...current, [msg.item.id]: msg.item },
        } as Partial<GameState>;
        if (msg.kind === 'handout' && get().me?.role === 'player' && !current[msg.item.id]) {
          patch.unseenHandouts = [...get().unseenHandouts, msg.item.id];
        }
        if (msg.kind === 'scene' && get().me?.role === 'gm' && !get().viewSceneId)
          patch.viewSceneId = msg.item.id;
        set(patch);
        return;
      }
      case 'remove': {
        if (msg.kind === 'adventure') return;
        const key = keyOf[msg.kind];
        const current = { ...(get()[key] as Rec<unknown>) };
        if (!(msg.id in current)) return;
        delete current[msg.id];
        const patch: Partial<GameState> = { [key]: current } as Partial<GameState>;
        if (msg.kind === 'token' && get().selectedTokenId === msg.id) patch.selectedTokenId = null;
        if (msg.kind === 'scene' && get().viewSceneId === msg.id)
          patch.viewSceneId = get().adventure?.activeSceneId ?? null;
        if (msg.kind === 'handout')
          patch.unseenHandouts = get().unseenHandouts.filter((h) => h !== msg.id);
        set(patch);
        return;
      }
      case 'message':
        set({ messages: [...get().messages.slice(-499), msg.item] });
        return;
      case 'audio':
        set({ audio: msg.state, serverOffset: msg.serverTime - Date.now() });
        return;
      case 'sfx':
        set({ sfx: { assetId: msg.assetId, volume: msg.volume, n: (get().sfx?.n ?? 0) + 1 } });
        return;
      case 'presence':
        set({ online: msg.online });
        return;
      case 'error':
        set({ errors: [...get().errors.slice(-4), { id: ++errorSeq, text: msg.message }] });
        return;
    }
  },

  setStatus: (status) => set({ status }),
  dismissError: (id) => set({ errors: get().errors.filter((e) => e.id !== id) }),
  markHandoutsSeen: () => set({ unseenHandouts: [] }),
  setViewScene: (viewSceneId) => set({ viewSceneId, selectedTokenId: null }),
  selectToken: (selectedTokenId) => set({ selectedTokenId }),
  moveTokenLocal(id, x, y) {
    const t = get().tokens[id];
    if (t) set({ tokens: { ...get().tokens, [id]: { ...t, x, y } } });
  },
  reset: () => set({ ...empty }),
}));

export const isGm = () => useGame.getState().me?.role === 'gm';

/** Die Szene, die dieser Client gerade auf der Karte zeigt. */
export function shownSceneId(s: GameState): string | null {
  return s.me?.role === 'gm' ? s.viewSceneId : (s.adventure?.activeSceneId ?? null);
}

// Für Tests und Fehlersuche im Browser erreichbar.
(window as unknown as { __vtt: typeof useGame }).__vtt = useGame;
