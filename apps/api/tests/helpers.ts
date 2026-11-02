import { SHEET_SUIVI, todayInTimezone } from '@suivi/shared';
import { MockProvider } from '../src/providers/MockProvider.js';
import type { CellValue } from '../src/providers/DataProvider.js';
import { buildMockGrid } from '../src/mock/seed.js';

/** Grille Suivi minimale : en-têtes + lignes datées autour d'aujourd'hui. */
export function suiviGrid(rows: (CellValue[] | [string] | [string, number])[]) {
  return [
    ['Date', 'N°Semaine', 'Sommeil', 'Forme', 'Poids', 'Calories', 'Glucides', 'Protéines', 'Lipides', 'Pas', 'Entraînement'],
    ...rows,
  ] as CellValue[][];
}

export function fr(dateKey: string): string {
  const [y, m, d] = dateKey.split('-');
  return `${d}/${m}/${y}`;
}

export function providerWith(grid: Record<string, CellValue[][]>) {
  return new MockProvider(grid);
}

export function emptyFullGrid(suivi: CellValue[][]) {
  const base = buildMockGrid(todayInTimezone());
  return { ...base, [SHEET_SUIVI]: suivi };
}
