// ------------------------------------------------------------------
// Helpers de notation A1 (ex. "C5", "A2:K33") utilisés par le provider
// mock et par la construction des plages autorisées.
// ------------------------------------------------------------------

export function colToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n; // 1-based
}

export function indexToCol(index: number): string {
  let s = '';
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export interface A1Range {
  colStart: number;
  rowStart: number;
  colEnd: number;
  rowEnd: number;
}

const CELL = /^([A-Z]+)(\d+)$/;
const RANGE = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+)?)?$/;

/** Parse une plage A1 (partie après le "!"). Supporte "C5", "C5:K5", "A2:K" (colonne ouverte). */
export function parseA1(a1: string): A1Range {
  const m = a1.trim().match(RANGE);
  if (!m) throw new Error(`Plage A1 invalide: ${a1}`);
  const colStart = colToIndex(m[1]!);
  const rowStart = Number(m[2]);
  const colEnd = m[3] ? colToIndex(m[3]) : colStart;
  const rowEnd = m[4] ? Number(m[4]) : rowStart;
  // "A2:K" => ligne de fin ouverte => bornée à rowStart côté mock.
  return { colStart, rowStart, colEnd, rowEnd };
}

export function isCellA1(a1: string): boolean {
  return CELL.test(a1.trim());
}

/** Construit une plage "C5:K5" à partir d'index. */
export function makeRange(
  colStart: number,
  rowStart: number,
  colEnd: number,
  rowEnd: number,
): string {
  return `${indexToCol(colStart)}${rowStart}:${indexToCol(colEnd)}${rowEnd}`;
}

/** Sépare "Suivi!A1:B2" en { sheet, a1 }. Gère les quotes : 'Full body'!A1. */
export function splitSheetRange(full: string): { sheet: string; a1: string } {
  const idx = full.indexOf('!');
  if (idx < 0) throw new Error(`Plage sans nom d'onglet: ${full}`);
  let sheet = full.slice(0, idx).trim();
  if (sheet.startsWith("'") && sheet.endsWith("'")) {
    sheet = sheet.slice(1, -1).replace(/''/g, "'");
  }
  return { sheet, a1: full.slice(idx + 1) };
}

/** Quote un nom d'onglet pour la notation A1 Google. */
export function quoteSheet(sheet: string): string {
  return `'${sheet.replace(/'/g, "''")}'`;
}
