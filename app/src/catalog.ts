import { SEAMLY_MEASUREMENT_CATALOG } from '@seamlyme/core';

export const CATEGORY_LABELS: Record<string, string> = {
  A: 'A — Height',       B: 'B — Width',       C: 'C — Indent',
  D: 'D — Hand',         E: 'E — Foot',         F: 'F — Head',
  G: 'G — Circumference',H: 'H — Vertical',     I: 'I — Horizontal',
  J: 'J — Bust',         K: 'K — Balance',      L: 'L — Arm',
  M: 'M — Leg',          N: 'N — Crotch',       O: 'O — Corsage',
  P: 'P — Across',       Q: 'Q — Dart',
};

export const CATEGORY_LETTERS = Object.keys(CATEGORY_LABELS) as string[];

/** Return the letter of a measurement ID like "G04" → "G", or null for custom. */
export function idToCategory(id: string): string | null {
  const m = id.match(/^([A-Q])\d+$/);
  return m ? m[1] : null;
}

/** All known variable names, keyed by letter category. */
export const CATALOG_BY_CATEGORY: Record<string, string[]> = {};
for (const entry of SEAMLY_MEASUREMENT_CATALOG) {
  const cat = idToCategory(entry.id);
  if (!cat) continue;
  if (!CATALOG_BY_CATEGORY[cat]) CATALOG_BY_CATEGORY[cat] = [];
  CATALOG_BY_CATEGORY[cat].push(entry.name);
}
