/** Kleine Würfelsymbole (W4 … W20, W100) als SVG, eingefärbt über `currentColor`. */

const SHAPES: Record<string, string> = {
  4: '12,2 22,20 2,20',
  6: '3,3 21,3 21,21 3,21',
  8: '12,1 23,12 12,23 1,12',
  10: '12,1 22,9 12,23 2,9',
  12: '12,1 23,9 19,22 5,22 1,9',
  20: '12,1 22,6.5 22,17.5 12,23 2,17.5 2,6.5',
};

export function shapeFor(sides: number): string {
  if (sides === 100) return SHAPES[10]!;
  return SHAPES[sides] ?? SHAPES[20]!;
}

export function DieIcon({
  sides,
  size = 18,
  label,
}: {
  sides: number;
  size?: number;
  label?: string | number;
}) {
  return (
    <svg className="die-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <polygon
        points={shapeFor(sides)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {label !== undefined && (
        <text x="12" y="15.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="currentColor">
          {label}
        </text>
      )}
    </svg>
  );
}

/** Ein geworfener Würfel: Form im Hintergrund, Augenzahl groß darüber. */
export function RolledDie({ sides, value, kept }: { sides: number; value: number; kept: boolean }) {
  const cls = ['rolled-die'];
  if (!kept) cls.push('dropped');
  else if (value === sides) cls.push('max');
  else if (value === 1) cls.push('min');
  return (
    <span className={cls.join(' ')} title={`W${sides}: ${value}${kept ? '' : ' (zählt nicht)'}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <polygon points={shapeFor(sides)} strokeLinejoin="round" />
      </svg>
      <span className="value">{value}</span>
    </span>
  );
}
