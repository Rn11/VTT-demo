import { useSyncExternalStore } from 'react';
import type { Character } from '@vtt/shared';
import { useGame } from './store';

/*
 * „Ich spiele als …“: Für welchen Charakter dieser Browser spricht und würfelt.
 * Gespeichert pro Abenteuer im Browser; ohne Auswahl wird der einzige eigene Charakter genommen.
 */

const key = (adventureId: string) => `vtt.as.${adventureId}`;
const listeners = new Set<() => void>();

function read(adventureId: string | undefined): string | null | undefined {
  if (!adventureId) return undefined;
  try {
    const v = localStorage.getItem(key(adventureId));
    return v === null ? undefined : v || null;
  } catch {
    return undefined;
  }
}

export function setSpeaker(adventureId: string, characterId: string | null): void {
  try {
    localStorage.setItem(key(adventureId), characterId ?? '');
  } catch {
    /* privates Fenster o. Ä. */
  }
  listeners.forEach((l) => l());
}

/** Charaktere, für die dieser Browser sprechen darf. */
export function speakableCharacters(
  characters: Record<string, Character>,
  role: 'gm' | 'player' | undefined,
  playerId: string | null | undefined,
): Character[] {
  const all = Object.values(characters).sort((a, b) => a.name.localeCompare(b.name));
  return role === 'gm'
    ? all
    : all.filter((c) => c.ownerPlayerId !== null && c.ownerPlayerId === playerId);
}

/** Aktuell gewählter Charakter (oder null = ohne Charakter). */
export function useSpeaker(): string | null {
  const adventureId = useGame((s) => s.adventure?.id);
  const characters = useGame((s) => s.characters);
  const me = useGame((s) => s.me);
  const stored = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => read(adventureId),
  );
  const options = speakableCharacters(characters, me?.role, me?.playerId);
  if (stored === null) return null;
  if (stored && options.some((c) => c.id === stored)) return stored;
  // Nichts (Gültiges) gewählt: Spieler mit genau einem Charakter sprechen automatisch als dieser.
  return me?.role === 'player' && options.length === 1 ? options[0]!.id : null;
}
