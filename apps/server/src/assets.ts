import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { Asset } from '@vtt/shared';
import type { Db } from './db';
import { newId } from './db';
import { toAsset, type AssetRow } from './repo';

export class AssetError extends Error {}

export const MAX_IMAGE_EDGE = 8192;
const THUMB_EDGE = 256;

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);
const AUDIO_MIMES: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
};

export function assetKindForMime(mime: string): 'image' | 'audio' | null {
  if (IMAGE_MIMES.has(mime)) return 'image';
  if (mime in AUDIO_MIMES) return 'audio';
  return null;
}

export const uploadsDir = (dataDir: string) => path.join(dataDir, 'uploads');
const advDir = (dataDir: string, adventureId: string) =>
  path.join(uploadsDir(dataDir), adventureId);

/** Pfad relativ zu `uploads/`. */
export const assetPath = (dataDir: string, rel: string) => path.join(uploadsDir(dataDir), rel);

function cleanName(name: string): string {
  const base = path.basename(name).replace(/\.[^.]+$/, '');
  // Steuerzeichen entfernen
  const printable = [...base].filter((ch) => ch.charCodeAt(0) >= 32).join('');
  return (printable.trim() || 'Datei').slice(0, 120);
}

export interface ImageResult {
  data: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
}

/** Wandelt ein Bild in WebP um (dreht nach EXIF, verkleinert auf max. 8192 px Kantenlänge). */
export async function processImage(input: Buffer): Promise<ImageResult> {
  try {
    const img = sharp(input, { limitInputPixels: 400_000_000 }).rotate();
    const { data, info } = await img
      .clone()
      .resize({
        width: MAX_IMAGE_EDGE,
        height: MAX_IMAGE_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    const thumb = await sharp(data)
      .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: 'inside' })
      .webp({ quality: 75 })
      .toBuffer();
    return { data, thumb, width: info.width, height: info.height };
  } catch {
    throw new AssetError('Das Bild konnte nicht gelesen werden.');
  }
}

export interface StoreInput {
  adventureId: string;
  name: string;
  mime: string;
  buffer: Buffer;
}

export async function storeAsset(db: Db, dataDir: string, input: StoreInput): Promise<AssetRow> {
  const kind = assetKindForMime(input.mime);
  if (!kind)
    throw new AssetError(
      'Dieser Dateityp wird nicht unterstützt. Erlaubt sind Bilder (PNG, JPG, WebP, GIF) und Audio (MP3, OGG, WAV, M4A).',
    );
  const id = newId(16);
  const dir = advDir(dataDir, input.adventureId);
  fs.mkdirSync(dir, { recursive: true });

  let row: AssetRow;
  if (kind === 'image') {
    const img = await processImage(input.buffer);
    const file = `${input.adventureId}/${id}.webp`;
    const thumb = `${input.adventureId}/${id}.thumb.webp`;
    fs.writeFileSync(assetPath(dataDir, file), img.data);
    fs.writeFileSync(assetPath(dataDir, thumb), img.thumb);
    row = {
      id,
      adventureId: input.adventureId,
      kind,
      name: cleanName(input.name),
      mime: 'image/webp',
      file,
      thumb,
      width: img.width,
      height: img.height,
    };
  } else {
    const file = `${input.adventureId}/${id}.${AUDIO_MIMES[input.mime]}`;
    fs.writeFileSync(assetPath(dataDir, file), input.buffer);
    row = {
      id,
      adventureId: input.adventureId,
      kind,
      name: cleanName(input.name),
      mime: input.mime,
      file,
      thumb: null,
      width: null,
      height: null,
    };
  }
  insertAssetRow(db, row);
  return row;
}

export function insertAssetRow(db: Db, row: AssetRow): void {
  db.prepare(
    'INSERT INTO assets (id, adventure_id, kind, name, mime, file, thumb, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    row.id,
    row.adventureId,
    row.kind,
    row.name,
    row.mime,
    row.file,
    row.thumb,
    row.width,
    row.height,
    Date.now(),
  );
}

/** Entfernt eine Datei und alle Verweise darauf. */
export function deleteAsset(db: Db, dataDir: string, row: AssetRow): void {
  db.prepare('UPDATE scenes SET map_asset_id = NULL WHERE map_asset_id = ?').run(row.id);
  db.prepare('UPDATE tokens SET asset_id = NULL WHERE asset_id = ?').run(row.id);
  db.prepare('UPDATE handouts SET asset_id = NULL WHERE asset_id = ?').run(row.id);
  db.prepare('DELETE FROM assets WHERE id = ?').run(row.id);
  for (const rel of [row.file, row.thumb])
    if (rel) fs.rmSync(assetPath(dataDir, rel), { force: true });
}

export function removeAdventureFiles(dataDir: string, adventureId: string): void {
  fs.rmSync(advDir(dataDir, adventureId), { recursive: true, force: true });
}

export const publicAsset = (row: AssetRow): Asset => toAsset(row);
