import sharp from 'sharp';
import type { Db } from './db';
import { newId } from './db';
import { storeAsset } from './assets';

/*
 * Beispielinhalte, die komplett im Code erzeugt werden (keine fremden Bilder, keine Lizenzfragen).
 */

const GRID = 70;

function dungeonSvg(): string {
  const w = GRID * 20;
  const h = GRID * 14;
  const room = (x: number, y: number, rw: number, rh: number) =>
    `<rect x="${x * GRID}" y="${y * GRID}" width="${rw * GRID}" height="${rh * GRID}" fill="url(#floor)" stroke="#3b2f22" stroke-width="10"/>`;
  const corridor = (x: number, y: number, cw: number, ch: number) =>
    `<rect x="${x * GRID}" y="${y * GRID}" width="${cw * GRID}" height="${ch * GRID}" fill="url(#floor)"/>`;
  const door = (x: number, y: number, vertical: boolean) =>
    vertical
      ? `<rect x="${x * GRID - 8}" y="${y * GRID + 15}" width="16" height="40" fill="#8a5a2b" stroke="#3b2f22" stroke-width="3"/>`
      : `<rect x="${x * GRID + 15}" y="${y * GRID - 8}" width="40" height="16" fill="#8a5a2b" stroke="#3b2f22" stroke-width="3"/>`;
  const pillar = (cx: number, cy: number) =>
    `<circle cx="${cx * GRID}" cy="${cy * GRID}" r="18" fill="#6d6253" stroke="#3b2f22" stroke-width="4"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <pattern id="floor" width="${GRID}" height="${GRID}" patternUnits="userSpaceOnUse">
      <rect width="${GRID}" height="${GRID}" fill="#c9b48f"/>
      <rect x="3" y="3" width="${GRID - 6}" height="${GRID - 6}" fill="#d6c3a0"/>
    </pattern>
    <radialGradient id="water"><stop offset="0" stop-color="#5aa3c9"/><stop offset="1" stop-color="#2a5f7f"/></radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="#2b2620"/>
  ${corridor(6, 4, 3, 1)}${corridor(11, 6, 1, 3)}${corridor(5, 9, 6, 1)}${corridor(14, 3, 1, 3)}
  ${room(1, 1, 5, 6)}${room(9, 1, 5, 5)}${room(15, 1, 4, 6)}${room(1, 8, 4, 5)}${room(9, 9, 10, 4)}
  ${door(6, 4, true)}${door(9, 4, true)}${door(11, 6, false)}${door(5, 9, true)}${door(14, 3, true)}${door(15, 3, true)}
  ${pillar(11, 2.5)}${pillar(12.5, 2.5)}${pillar(11, 4.5)}${pillar(12.5, 4.5)}
  <ellipse cx="${16.5 * GRID}" cy="${11 * GRID}" rx="${1.8 * GRID}" ry="${1.1 * GRID}" fill="url(#water)" stroke="#1f3d52" stroke-width="5"/>
  <rect x="${2 * GRID}" y="${2 * GRID}" width="${GRID}" height="${GRID * 0.6}" fill="#7a4e24" stroke="#3b2f22" stroke-width="4"/>
  <rect x="${16 * GRID}" y="${2 * GRID}" width="${2 * GRID}" height="${GRID}" fill="#55606b" stroke="#2b3036" stroke-width="5"/>
</svg>`;
}

function tokenSvg(kind: 'hero' | 'monster' | 'npc'): string {
  const colors = { hero: '#3b6fd8', monster: '#c0392b', npc: '#2e8b57' } as const;
  const icon = {
    hero: '<path d="M128 40 L140 150 L128 168 L116 150 Z" fill="#eee"/><rect x="96" y="150" width="64" height="12" rx="4" fill="#d4a017"/><rect x="122" y="160" width="12" height="40" fill="#7a4e24"/>',
    monster:
      '<path d="M70 90 L95 40 L110 95 Z M186 90 L161 40 L146 95 Z" fill="#eee"/><circle cx="128" cy="140" r="52" fill="#7a1f16"/><circle cx="108" cy="130" r="10" fill="#ffd400"/><circle cx="148" cy="130" r="10" fill="#ffd400"/><path d="M100 165 L156 165 L148 180 L108 180 Z" fill="#eee"/>',
    npc: '<circle cx="128" cy="105" r="40" fill="#f1d3b3"/><path d="M60 210 Q128 120 196 210 Z" fill="#8e6f3e"/><circle cx="114" cy="100" r="5" fill="#333"/><circle cx="142" cy="100" r="5" fill="#333"/><path d="M114 120 Q128 130 142 120" stroke="#333" stroke-width="4" fill="none"/>',
  }[kind];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <circle cx="128" cy="128" r="124" fill="${colors[kind]}"/>${icon}</svg>`;
}

const png = (svg: string) => sharp(Buffer.from(svg)).png().toBuffer();

export async function createSampleContent(
  db: Db,
  dataDir: string,
  adventureId: string,
): Promise<void> {
  const map = await storeAsset(db, dataDir, {
    adventureId,
    name: 'Beispiel-Gewölbe',
    mime: 'image/png',
    buffer: await png(dungeonSvg()),
  });
  const hero = await storeAsset(db, dataDir, {
    adventureId,
    name: 'Beispiel-Held',
    mime: 'image/png',
    buffer: await png(tokenSvg('hero')),
  });
  const monster = await storeAsset(db, dataDir, {
    adventureId,
    name: 'Beispiel-Monster',
    mime: 'image/png',
    buffer: await png(tokenSvg('monster')),
  });
  const npc = await storeAsset(db, dataDir, {
    adventureId,
    name: 'Beispiel-Händlerin',
    mime: 'image/png',
    buffer: await png(tokenSvg('npc')),
  });

  const sceneId = newId();
  db.prepare(
    'INSERT INTO scenes (id, adventure_id, name, map_asset_id, map_width, map_height, grid_size, grid_visible, sort) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)',
  ).run(
    sceneId,
    adventureId,
    'Das alte Gewölbe',
    map.id,
    map.width ?? GRID * 20,
    map.height ?? GRID * 14,
    GRID,
  );
  db.prepare('UPDATE adventures SET active_scene_id = ? WHERE id = ?').run(sceneId, adventureId);

  const token = (
    name: string,
    assetId: string,
    color: string,
    cx: number,
    cy: number,
    hidden: boolean,
  ) =>
    db
      .prepare(
        'INSERT INTO tokens (id, adventure_id, scene_id, name, asset_id, color, x, y, size, hidden, owner_player_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL)',
      )
      .run(
        newId(),
        adventureId,
        sceneId,
        name,
        assetId,
        color,
        (cx + 0.5) * GRID,
        (cy + 0.5) * GRID,
        hidden ? 1 : 0,
      );
  token('Heldin', hero.id, '#3b6fd8', 3, 3, false);
  token('Händlerin', npc.id, '#2e8b57', 11, 3, false);
  token('Lauerndes Ungeheuer', monster.id, '#c0392b', 16, 10, true);

  const now = Date.now();
  db.prepare(
    'INSERT INTO handouts (id, adventure_id, title, body, asset_id, visibility, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?)',
  ).run(
    newId(),
    adventureId,
    'Ein zerknitterter Brief',
    'Wer dies liest: Meidet das Wasserbecken im Süden. Etwas wohnt darin.\n\n– E.',
    'none',
    now,
  );
  db.prepare(
    'INSERT INTO notes (id, adventure_id, title, body, scene_id, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    newId(),
    adventureId,
    'Was hier passiert',
    'Die Händlerin verkauft Fackeln und Seil. Im Wasserbecken lauert ein Ungeheuer (versteckte Figur). Den Brief erst aufdecken, wenn die Gruppe die Truhe im ersten Raum öffnet.',
    sceneId,
    now,
  );
}
