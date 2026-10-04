/**
 * Vorlagen für Charakterbögen. Bewusst ohne Regelautomatik: nur Felder zum Ausfüllen.
 * `roll` ist ein optionaler Würfelausdruck für einen Würfel-Knopf neben dem Feld;
 * `@` wird durch den Feldwert ersetzt (z. B. "d20+@" bei Mörk Borg).
 * Bei `under: true` wird gegen den Feldwert gewürfelt (Prozentwurf ≤ Wert = Erfolg).
 */

export type FieldType = 'text' | 'number' | 'textarea' | 'check';

export interface SheetField {
  key: string;
  label: string;
  type: FieldType;
  roll?: string;
  under?: boolean;
}

export interface SheetSection {
  title: string;
  fields: SheetField[];
}

export interface SheetTemplate {
  id: string;
  name: string;
  sections: SheetSection[];
}

const text = (key: string, label: string): SheetField => ({ key, label, type: 'text' });
const num = (key: string, label: string, roll?: string): SheetField => ({
  key,
  label,
  type: 'number',
  ...(roll ? { roll } : {}),
});
const area = (key: string, label: string): SheetField => ({ key, label, type: 'textarea' });
const pct = (key: string, label: string): SheetField => ({
  key,
  label,
  type: 'number',
  roll: 'd100',
  under: true,
});

export const SHEET_TEMPLATES: SheetTemplate[] = [
  {
    id: 'free',
    name: 'Frei (eigene Felder)',
    sections: [
      { title: 'Allgemein', fields: [text('concept', 'Konzept'), area('notes', 'Notizen')] },
    ],
  },
  {
    id: 'dnd5e',
    name: 'Dungeons & Dragons 5e',
    sections: [
      {
        title: 'Grunddaten',
        fields: [
          text('class', 'Klasse & Stufe'),
          text('species', 'Volk'),
          text('background', 'Hintergrund'),
          text('alignment', 'Gesinnung'),
        ],
      },
      {
        title: 'Attribute',
        fields: [
          num('str', 'Stärke'),
          num('dex', 'Geschicklichkeit'),
          num('con', 'Konstitution'),
          num('int', 'Intelligenz'),
          num('wis', 'Weisheit'),
          num('cha', 'Charisma'),
        ],
      },
      {
        title: 'Kampf',
        fields: [
          num('ac', 'Rüstungsklasse'),
          num('init', 'Initiative', 'd20+@'),
          num('speed', 'Bewegungsrate'),
          num('hpMax', 'TP maximal'),
          num('hp', 'TP aktuell'),
          num('hpTemp', 'Temporäre TP'),
          text('hitDice', 'Trefferwürfel'),
          num('prof', 'Übungsbonus'),
        ],
      },
      {
        title: 'Fähigkeiten',
        fields: [
          area('skills', 'Fertigkeiten & Rettungswürfe'),
          area('attacks', 'Angriffe & Zauber'),
          area('features', 'Merkmale'),
          area('equipment', 'Ausrüstung'),
        ],
      },
    ],
  },
  {
    id: 'coc7',
    name: 'Call of Cthulhu',
    sections: [
      {
        title: 'Ermittler',
        fields: [text('occupation', 'Beruf'), num('age', 'Alter'), text('residence', 'Wohnort')],
      },
      {
        title: 'Eigenschaften',
        fields: [
          pct('str', 'Stärke (ST)'),
          pct('con', 'Konstitution (KO)'),
          pct('siz', 'Größe (GR)'),
          pct('dex', 'Geschicklichkeit (GE)'),
          pct('app', 'Erscheinung (ER)'),
          pct('int', 'Intelligenz (IN)'),
          pct('pow', 'Mana (MA)'),
          pct('edu', 'Bildung (BI)'),
        ],
      },
      {
        title: 'Zustand',
        fields: [
          num('hp', 'Trefferpunkte'),
          num('mp', 'Magiepunkte'),
          pct('san', 'Stabilität'),
          pct('luck', 'Glück'),
          num('mov', 'Bewegungsweite'),
        ],
      },
      {
        title: 'Fertigkeiten',
        fields: [
          pct('spot', 'Verborgenes erkennen'),
          pct('listen', 'Horchen'),
          pct('library', 'Bibliotheksnutzung'),
          pct('psychology', 'Psychologie'),
          pct('persuade', 'Überreden'),
          pct('stealth', 'Verbergen'),
          pct('firstAid', 'Erste Hilfe'),
          pct('occult', 'Okkultismus'),
          pct('dodge', 'Ausweichen'),
          pct('brawl', 'Nahkampf (Handgemenge)'),
          pct('handgun', 'Schusswaffen (Faustfeuerwaffe)'),
          area('otherSkills', 'Weitere Fertigkeiten'),
        ],
      },
      {
        title: 'Hintergrund',
        fields: [area('backstory', 'Hintergrundgeschichte'), area('gear', 'Ausrüstung & Besitz')],
      },
    ],
  },
  {
    id: 'deltagreen',
    name: 'Delta Green',
    sections: [
      {
        title: 'Agent',
        fields: [text('profession', 'Beruf'), text('employer', 'Arbeitgeber'), num('age', 'Alter')],
      },
      {
        title: 'Werte',
        fields: [
          num('str', 'Stärke'),
          num('con', 'Konstitution'),
          num('dex', 'Geschicklichkeit'),
          num('int', 'Intelligenz'),
          num('pow', 'Willenskraft'),
          num('cha', 'Charisma'),
        ],
      },
      {
        title: 'Abgeleitete Werte',
        fields: [
          num('hp', 'Trefferpunkte'),
          num('wp', 'Willenskraftpunkte'),
          pct('san', 'Geistige Gesundheit'),
          num('bp', 'Bruchpunkt'),
        ],
      },
      {
        title: 'Fertigkeiten',
        fields: [
          pct('alertness', 'Wachsamkeit'),
          pct('search', 'Durchsuchen'),
          pct('stealth', 'Heimlichkeit'),
          pct('persuade', 'Überzeugen'),
          pct('firstAid', 'Erste Hilfe'),
          pct('firearms', 'Schusswaffen'),
          pct('melee', 'Nahkampfwaffen'),
          pct('dodge', 'Ausweichen'),
          pct('occult', 'Okkultismus'),
          pct('bureaucracy', 'Bürokratie'),
          area('otherSkills', 'Weitere Fertigkeiten'),
        ],
      },
      {
        title: 'Bindungen',
        fields: [
          area('bonds', 'Bindungen'),
          area('motivations', 'Motivationen & Störungen'),
          area('gear', 'Ausrüstung'),
        ],
      },
    ],
  },
  {
    id: 'shadowdark',
    name: 'Shadowdark',
    sections: [
      {
        title: 'Grunddaten',
        fields: [
          text('ancestry', 'Abstammung'),
          text('class', 'Klasse'),
          num('level', 'Stufe'),
          text('title', 'Titel'),
          text('alignment', 'Gesinnung'),
          text('background', 'Hintergrund'),
          text('deity', 'Gottheit'),
        ],
      },
      {
        title: 'Attribute',
        fields: [
          num('str', 'Stärke'),
          num('dex', 'Geschicklichkeit'),
          num('con', 'Konstitution'),
          num('int', 'Intelligenz'),
          num('wis', 'Weisheit'),
          num('cha', 'Charisma'),
        ],
      },
      {
        title: 'Kampf',
        fields: [
          num('ac', 'Rüstungsklasse'),
          num('hpMax', 'TP maximal'),
          num('hp', 'TP aktuell'),
          { key: 'luck', label: 'Glücksmarke', type: 'check' },
        ],
      },
      {
        title: 'Ausrüstung',
        fields: [
          area('gear', 'Ausrüstung (Plätze)'),
          num('gold', 'Gold'),
          area('talents', 'Talente'),
          area('spells', 'Zauber'),
        ],
      },
    ],
  },
  {
    id: 'morkborg',
    name: 'Mörk Borg',
    sections: [
      {
        title: 'Grunddaten',
        fields: [text('class', 'Klasse'), area('traits', 'Eigenschaften & Gebrechen')],
      },
      {
        title: 'Fähigkeiten',
        fields: [
          num('strength', 'Stärke', 'd20+@'),
          num('agility', 'Gewandtheit', 'd20+@'),
          num('presence', 'Präsenz', 'd20+@'),
          num('toughness', 'Zähigkeit', 'd20+@'),
        ],
      },
      {
        title: 'Zustand',
        fields: [
          num('hpMax', 'TP maximal'),
          num('hp', 'TP aktuell'),
          num('omens', 'Omen'),
          num('silver', 'Silber'),
        ],
      },
      {
        title: 'Ausrüstung',
        fields: [
          text('weapon', 'Waffe'),
          text('armor', 'Rüstung'),
          area('gear', 'Ausrüstung'),
          area('powers', 'Schriftrollen & Kräfte'),
        ],
      },
    ],
  },
];

export function getTemplate(id: string): SheetTemplate {
  return SHEET_TEMPLATES.find((t) => t.id === id) ?? SHEET_TEMPLATES[0]!;
}

export function isTemplateId(id: string): boolean {
  return SHEET_TEMPLATES.some((t) => t.id === id);
}

/** Baut den Würfelausdruck für ein Feld, z. B. "d20+@" mit Wert -2 → "d20-2". */
export function fieldRollExpression(field: SheetField, value: unknown): string | null {
  if (!field.roll) return null;
  if (!field.roll.includes('@')) return field.roll;
  const n = typeof value === 'number' ? value : Number(value);
  const v = Number.isFinite(n) ? Math.trunc(n) : 0;
  return field.roll.replace('@', String(v)).replace('+-', '-');
}
