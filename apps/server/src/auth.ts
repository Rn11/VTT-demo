import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Db } from './db';
import { newId } from './db';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const GM_COOKIE = 'vtt_gm';
export const playerCookie = (adventureId: string) => `vtt_p_${adventureId}`;
const SESSION_DAYS = 60;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt:${salt.toString('base64')}:${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, hashB64] = stored.split(':');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

export interface Gm {
  id: string;
  name: string;
}

export function gmCount(db: Db): number {
  const r = db.prepare('SELECT COUNT(*) AS n FROM gm_users').get() as { n: number };
  return Number(r.n);
}

export async function createGm(db: Db, name: string, password: string): Promise<Gm> {
  const id = newId();
  db.prepare('INSERT INTO gm_users (id, name, pass_hash, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    name,
    await hashPassword(password),
    Date.now(),
  );
  return { id, name };
}

export async function loginGm(db: Db, name: string, password: string): Promise<Gm | null> {
  const r = db.prepare('SELECT id, name, pass_hash FROM gm_users WHERE name = ?').get(name) as
    { id: string; name: string; pass_hash: string } | undefined;
  // Auch bei unbekanntem Namen hashen, damit die Antwortzeit nichts verrät.
  const ok = await verifyPassword(
    password,
    r?.pass_hash ??
      `scrypt:${randomBytes(16).toString('base64')}:${randomBytes(64).toString('base64')}`,
  );
  return r && ok ? { id: String(r.id), name: String(r.name) } : null;
}

export function createSession(db: Db, gmId: string): string {
  const token = newId(32);
  db.prepare('INSERT INTO sessions (token, gm_id, created_at) VALUES (?, ?, ?)').run(
    token,
    gmId,
    Date.now(),
  );
  return token;
}

export function deleteSession(db: Db, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function gmFromSession(db: Db, token: string | undefined): Gm | null {
  if (!token) return null;
  const r = db
    .prepare(
      'SELECT g.id, g.name, s.created_at FROM sessions s JOIN gm_users g ON g.id = s.gm_id WHERE s.token = ?',
    )
    .get(token) as { id: string; name: string; created_at: number } | undefined;
  if (!r) return null;
  if (Date.now() - Number(r.created_at) > SESSION_DAYS * 86_400_000) {
    deleteSession(db, token);
    return null;
  }
  return { id: String(r.id), name: String(r.name) };
}

export interface PlayerSession {
  id: string;
  name: string;
  adventureId: string;
}

export function playerFromToken(
  db: Db,
  adventureId: string,
  token: string | undefined,
): PlayerSession | null {
  if (!token) return null;
  const r = db
    .prepare('SELECT id, name, adventure_id FROM players WHERE token = ? AND adventure_id = ?')
    .get(token, adventureId) as { id: string; name: string; adventure_id: string } | undefined;
  return r ? { id: String(r.id), name: String(r.name), adventureId: String(r.adventure_id) } : null;
}

/** Einfache Cookie-Auswertung für den WebSocket-Handshake. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}
