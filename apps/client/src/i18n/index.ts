import { de, type Dict } from './de';

export type TextKey = keyof Dict;

const dict: Dict = de;

/** Text holen und Platzhalter wie {name} ersetzen. */
export function t(key: TextKey, vars?: Record<string, string | number>): string {
  let s = dict[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
