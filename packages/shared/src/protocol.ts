import { z } from 'zod';

const id = z.string().min(1).max(64);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const coord = z.number().finite().min(-100_000).max(100_000);
const shortText = z.string().max(120);
const longText = z.string().max(20_000);

export const fieldValue = z.union([z.string().max(5000), z.number().finite(), z.boolean()]);

export const clientMessage = z.discriminatedUnion('type', [
  // Szenen
  z.object({ type: z.literal('scene.create'), name: shortText.min(1) }),
  z.object({
    type: z.literal('scene.update'),
    id,
    name: shortText.min(1).optional(),
    mapAssetId: id.nullable().optional(),
    gridSize: z.number().int().min(10).max(500).optional(),
    gridVisible: z.boolean().optional(),
  }),
  z.object({ type: z.literal('scene.delete'), id }),
  z.object({ type: z.literal('scene.activate'), id }),

  // Spielfiguren
  z.object({
    type: z.literal('token.create'),
    sceneId: id,
    name: shortText,
    assetId: id.nullable(),
    color,
    x: coord,
    y: coord,
    size: z.number().min(0.25).max(20),
    hidden: z.boolean(),
    ownerPlayerId: id.nullable(),
  }),
  z.object({
    type: z.literal('token.update'),
    id,
    name: shortText.optional(),
    assetId: id.nullable().optional(),
    color: color.optional(),
    size: z.number().min(0.25).max(20).optional(),
    hidden: z.boolean().optional(),
    ownerPlayerId: id.nullable().optional(),
  }),
  z.object({ type: z.literal('token.move'), id, x: coord, y: coord }),
  z.object({ type: z.literal('token.delete'), id }),

  // Handouts
  z.object({
    type: z.literal('handout.create'),
    title: shortText.min(1),
    body: longText,
    assetId: id.nullable(),
  }),
  z.object({
    type: z.literal('handout.update'),
    id,
    title: shortText.min(1).optional(),
    body: longText.optional(),
    assetId: id.nullable().optional(),
    visibility: z.enum(['none', 'all', 'some']).optional(),
    playerIds: z.array(id).max(50).optional(),
  }),
  z.object({ type: z.literal('handout.delete'), id }),

  // Notizen (nur Spielleiter)
  z.object({
    type: z.literal('note.create'),
    title: shortText.min(1),
    body: longText,
    sceneId: id.nullable(),
  }),
  z.object({
    type: z.literal('note.update'),
    id,
    title: shortText.min(1).optional(),
    body: longText.optional(),
    sceneId: id.nullable().optional(),
  }),
  z.object({ type: z.literal('note.delete'), id }),

  // Charaktere
  z.object({
    type: z.literal('character.create'),
    name: shortText.min(1),
    templateId: z.string().max(40),
    ownerPlayerId: id.nullable(),
  }),
  z.object({
    type: z.literal('character.update'),
    id,
    name: shortText.min(1).optional(),
    values: z.record(z.string().max(60), fieldValue).optional(),
    custom: z
      .array(z.object({ label: shortText, value: z.string().max(5000) }))
      .max(100)
      .optional(),
    ownerPlayerId: id.nullable().optional(),
  }),
  z.object({ type: z.literal('character.delete'), id }),

  // Protokoll
  z.object({ type: z.literal('chat.send'), text: z.string().min(1).max(2000) }),
  z.object({
    type: z.literal('dice.roll'),
    expression: z.string().min(1).max(200),
    label: z.string().max(120).optional(),
    hidden: z.boolean().optional(),
  }),

  // Musik und Geräusche (nur Spielleiter)
  z.object({ type: z.literal('audio.play'), assetId: id, loop: z.boolean() }),
  z.object({ type: z.literal('audio.pause') }),
  z.object({ type: z.literal('audio.resume') }),
  z.object({ type: z.literal('audio.stop') }),
  z.object({ type: z.literal('audio.loop'), loop: z.boolean() }),
  z.object({ type: z.literal('audio.volume'), volume: z.number().min(0).max(1) }),
  z.object({ type: z.literal('sfx.play'), assetId: id, volume: z.number().min(0).max(1) }),
]);

export type ClientMessage = z.infer<typeof clientMessage>;
export type ClientMessageType = ClientMessage['type'];

/** Aktionen, die Spieler grundsätzlich ausführen dürfen (Feinprüfung im Server). */
export const PLAYER_ACTIONS: ReadonlySet<ClientMessageType> = new Set<ClientMessageType>([
  'token.move',
  'character.create',
  'character.update',
  'chat.send',
  'dice.roll',
]);
