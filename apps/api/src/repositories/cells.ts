import { EMPTY_PLACEHOLDER } from '@suivi/shared';
import type { CellValue } from '../providers/DataProvider.js';

// ------------------------------------------------------------------
// Normalisation des cellules lues depuis une grille (Sheets ou mock).
// Le fichier utilise « - » comme convention pour « pas de donnée ».
// Les valeurs absentes (vide, '-', '—') deviennent null — jamais 0.
// ------------------------------------------------------------------

export function isEmptyCell(v: CellValue | undefined): boolean {
  if (v == null) return true;
  if (typeof v === 'string') {
    const s = v.trim();
    return s === '' || s === EMPTY_PLACEHOLDER || s === '—' || s === '–';
  }
  return false;
}

/** Nombre ou null. Accepte 75.5, "75.5", "75,5" (locale FR), entier string. */
export function toNumber(v: CellValue | undefined): number | null {
  if (isEmptyCell(v)) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return null;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function toText(v: CellValue | undefined): string | null {
  if (isEmptyCell(v)) return null;
  return String(v).trim();
}

/** Valeur de cellule à écrire : null redevient le placeholder « - ». */
export function fromNullable(v: number | string | null): CellValue {
  return v === null ? EMPTY_PLACEHOLDER : v;
}

/** Compare deux valeurs normalisées (null === null, 75.5 === 75.5). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < 1e-9;
  }
  return String(a).trim() === String(b).trim();
}
