import fs from 'node:fs';
import path from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { z } from 'zod';
import type { Db } from './db';
import { newId, tx } from './db';
import { assetPath, insertAssetRow, processImage, assetKindForMime } from './assets';
import { loadAdventureData, toAssetRow, type AssetRow } from './repo';

/*
 * Export eines Abenteuers als ZIP: adventure.json + Dateien unter files/.
 * Spieler, Protokoll und Einladungslink werden nicht exportiert;
 * Spieler-Charaktere werden beim Import zu Nichtspielercharakteren.
 */

const FORMAT = 'vtt-adventure';
const VERSION = 1;

const idS = z.string().min(1).max(64);
const exportSchema = z.object({
  format: z.literal(FORMAT),
  version: z.literal(VERSION),
  adventure: z.object({ name: z.string().min(1).max(120), activeSceneId: idS.nullable() }),
  assets: z
    .array(
      z.object({
        id: idS,
        kind: z.enum(['image', 'audio']),
        name: z.string().max(120),
        mime: z.string().max(60),
        file: z.string().max(200),
      }),
    )
    .max(5000),
  scenes: z
    .array(
      z.object({
        id: idS,
        name: z.string().max(120),
        mapAssetId: idS.nullable(),
        mapWidth: z.number(),
        mapHeight: z.number(),
        gridSize: z.number().int().min(10).max(500),
        gridVisible: z.boolean(),
        sort: z.number().int(),
      }),
    )
    .max(1000),
  tokens: z
    .array(
      z.object({
        id: idS,
        sceneId: idS,
        name: z.string().max(120),
        assetId: idS.nullable(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        x: z.number().finite(),
        y: z.number().finite(),
        size: z.number().min(0.25).max(20),
        hidden: z.boolean(),
      }),
    )
    .max(20000),
  handouts: z
    .array(
      z.object({
        id: idS,
        title: z.string().max(120),
        body: z.string().max(20000),
        assetId: idS.nullable(),
        visibility: z.enum(['none', 'all', 'some']),
      }),
    )
    .max(5000),
  notes: z
    .array(
      z.object({
        id: idS,
        title: z.string().max(120),
        body: z.string().max(20000),
        sceneId: idS.nullable(),
      }),
    )
    .max(5000),
  characters: z
    .array(
      z.object({
        id: idS,
        name: z.string().max(120),
        templateId: z.string().max(40),
        values: z.record(
          z.string().max(60),
          z.union([z.string().max(5000), z.number(), z.boolean()]),
        ),
        custom: z
          .array(z.object({ label: z.string().max(120), value: z.string().max(5000) }))
          .max(100),
      }),
    )
    .max(5000),
});

export type ExportData = z.infer<typeof exportSchema>;

export class ImportError extends Error {}

export function exportAdventure(
  db: Db,
  dataDir: string,
  adventureId: string,
): { name: string; zip: Uint8Array } | null {
  const data = loadAdventureData(db, adventureId);
  if (!data) return null;
  const rows = (
    db.prepare('SELECT * FROM assets WHERE adventure_id = ?').all(adventureId) as Record<
      string,
      unknown
    >[]
  ).map(toAssetRow);

  const files: Zippable = {};
  const assets: ExportData['assets'] = [];
  for (const a of rows) {
    const abs = assetPath(dataDir, a.file);
    if (!fs.existsSync(abs)) continue;
    const name = `files/${a.id}${path.extname(a.file)}`;
    files[name] = [fs.readFileSync(abs), { level: 0 }];
    assets.push({ id: a.id, kind: a.kind, name: a.name, mime: a.mime, file: name });
  }

  const json: ExportData = {
    format: FORMAT,
    version: VERSION,
    adventure: { name: data.adventure.name, activeSceneId: data.adventure.activeSceneId },
    assets,
    scenes: data.scenes,
    tokens: data.tokens.map(({ ownerPlayerId: _o, ...t }) => t),
    handouts: data.handouts.map((h) => ({
      id: h.id,
      title: h.title,
      body: h.body,
      assetId: h.assetId,
      visibility: h.visibility === 'some' ? 'none' : h.visibility,
    })),
    notes: data.notes.map(({ updatedAt: _u, ...n }) => n),
    characters: data.characters.map(({ ownerPlayerId: _o, ...c }) => c),
  };
  files['adventure.json'] = strToU8(JSON.stringify(json, null, 2));
  return { name: data.adventure.name, zip: zipSync(files) };
}

export async function importAdventure(
  db: Db,
  dataDir: string,
  gmId: string,
  zip: Uint8Array,
  inviteToken: string,
): Promise<string> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip);
  } catch {
    throw new ImportError('Die Datei ist kein gültiges ZIP-Archiv.');
  }
  const raw = entries['adventure.json'];
  if (!raw) throw new ImportError('In der Datei fehlt adventure.json.');
  let parsed: ExportData;
  try {
    parsed = exportSchema.parse(JSON.parse(strFromU8(raw)));
  } catch {
    throw new ImportError('adventure.json hat ein unbekanntes Format.');
  }

  const advId = newId();
  const map = new Map<string, string>();
  const remap = (old: string | null): string | null => (old ? (map.get(old) ?? null) : null);
  const fresh = (old: string) => {
    const id = newId();
    map.set(old, id);
    return id;
  };

  const dir = path.join(dataDir, 'uploads', advId);
  fs.mkdirSync(dir, { recursive: true });
  try {
    await writeImport(db, dataDir, gmId, advId, inviteToken, parsed, entries, fresh, remap);
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  }
  return advId;
}

async function writeImport(
  db: Db,
  dataDir: string,
  gmId: string,
  advId: string,
  inviteToken: string,
  parsed: ExportData,
  entries: Record<string, Uint8Array>,
  fresh: (old: string) => string,
  remap: (old: string | null) => string | null,
): Promise<void> {
  // Dateien zuerst schreiben (außerhalb der Transaktion, da asynchron); Bilder werden erneut geprüft.
  const assetRows: AssetRow[] = [];
  for (const a of parsed.assets) {
    const buf = entries[a.file];
    if (!buf) continue;
    const id = fresh(a.id);
    if (a.kind === 'image') {
      const img = await processImage(Buffer.from(buf));
      const file = `${advId}/${id}.webp`;
      const thumb = `${advId}/${id}.thumb.webp`;
      fs.writeFileSync(assetPath(dataDir, file), img.data);
      fs.writeFileSync(assetPath(dataDir, thumb), img.thumb);
      assetRows.push({
        id,
        adventureId: advId,
        kind: 'image',
        name: a.name,
        mime: 'image/webp',
        file,
        thumb,
        width: img.width,
        height: img.height,
      });
    } else {
      if (assetKindForMime(a.mime) !== 'audio') continue;
      const file = `${advId}/${id}${path
        .extname(a.file)
        .replace(/[^.a-z0-9]/gi, '')
        .slice(0, 6)}`;
      fs.writeFileSync(assetPath(dataDir, file), Buffer.from(buf));
      assetRows.push({
        id,
        adventureId: advId,
        kind: 'audio',
        name: a.name,
        mime: a.mime,
        file,
        thumb: null,
        width: null,
        height: null,
      });
    }
  }

  const now = Date.now();
  tx(db, () => {
    db.prepare(
      'INSERT INTO adventures (id, gm_id, name, invite_token, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(advId, gmId, parsed.adventure.name, inviteToken, now);
    for (const r of assetRows) insertAssetRow(db, r);
    for (const s of parsed.scenes) {
      db.prepare(
        'INSERT INTO scenes (id, adventure_id, name, map_asset_id, map_width, map_height, grid_size, grid_visible, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        fresh(s.id),
        advId,
        s.name,
        remap(s.mapAssetId),
        s.mapWidth,
        s.mapHeight,
        s.gridSize,
        s.gridVisible ? 1 : 0,
        s.sort,
      );
    }
    for (const t of parsed.tokens) {
      const sceneId = remap(t.sceneId);
      if (!sceneId) continue;
      db.prepare(
        'INSERT INTO tokens (id, adventure_id, scene_id, name, asset_id, color, x, y, size, hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        fresh(t.id),
        advId,
        sceneId,
        t.name,
        remap(t.assetId),
        t.color,
        t.x,
        t.y,
        t.size,
        t.hidden ? 1 : 0,
      );
    }
    for (const h of parsed.handouts) {
      db.prepare(
        'INSERT INTO handouts (id, adventure_id, title, body, asset_id, visibility, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(
        fresh(h.id),
        advId,
        h.title,
        h.body,
        remap(h.assetId),
        h.visibility === 'some' ? 'none' : h.visibility,
        now,
      );
    }
    for (const n of parsed.notes) {
      db.prepare(
        'INSERT INTO notes (id, adventure_id, title, body, scene_id, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(fresh(n.id), advId, n.title, n.body, remap(n.sceneId), now);
    }
    for (const c of parsed.characters) {
      db.prepare(
        'INSERT INTO characters (id, adventure_id, name, template_id, data, custom) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(
        fresh(c.id),
        advId,
        c.name,
        c.templateId,
        JSON.stringify(c.values),
        JSON.stringify(c.custom),
      );
    }
    db.prepare('UPDATE adventures SET active_scene_id = ? WHERE id = ?').run(
      remap(parsed.adventure.activeSceneId),
      advId,
    );
  });
}
