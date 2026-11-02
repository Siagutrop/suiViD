import { SHEET_FULL_BODY, type Session } from '@suivi/shared';
import type { CellValue, DataProvider } from '../providers/DataProvider.js';
import { isEmptyCell, toText } from './cells.js';

// ------------------------------------------------------------------
// Reporte une séance terminée dans l'onglet « Full body » du coach.
//
// L'onglet contient des blocs modèles répétés (~15 lignes) : titre
// « Full body », 2 lignes d'en-têtes, puis les lignes d'exercices avec
// des « X » dans les colonnes Charge/Rép. des séries 1..3 — le coach
// attend que l'athlète les remplisse.
//
// Règles :
// - on remplit le premier bloc ENTIÈREMENT libre (que des X/vides) ;
// - s'il n'y en a plus, on DUPLIQUE le dernier bloc en fin d'onglet ;
// - le titre devient « Full body — JJ/MM/AAAA » ;
// - séries non faites → « - » ; exercices absents du modèle → ignorés
//   (l'onglet Seances reste l'enregistrement complet) ;
// - jamais d'écrasement d'un bloc déjà rempli.
// ------------------------------------------------------------------

interface BlockRow {
  row: number; // 1-based
  name: string;
}

interface Block {
  titleRow: number; // 1-based
  endRow: number; // 1-based (dernière ligne d'exo ou d'en-tête)
  exoRows: BlockRow[];
  free: boolean;
}

export interface FullBodyReport {
  blockTitleRow: number;
  appendedBlock: boolean;
  cellsWritten: number;
  skippedExercises: string[];
}

const TITLE_RE = /^full body/i;
const CHARGE_COLS = [4, 6, 8]; // E, G, I — Charge S1/S2/S3 (0-based)
const REPS_COLS = [5, 7, 9]; // F, H, J — Rép. S1/S2/S3

function isFreeCell(v: CellValue | undefined): boolean {
  return isEmptyCell(v) || String(v).trim().toLowerCase() === 'x';
}

/** Repère les blocs « Full body » et détermine ceux encore libres. */
function findBlocks(grid: CellValue[][]): Block[] {
  const blocks: Block[] = [];
  for (let i = 0; i < grid.length; i++) {
    if (!TITLE_RE.test(toText(grid[i]?.[0]) ?? '')) continue;
    const exoRows: BlockRow[] = [];
    let free = true;
    let endRow = i + 3; // titre + 2 lignes d'en-têtes minimum
    for (let j = i + 3; j < grid.length; j++) {
      const row = grid[j] ?? [];
      if (TITLE_RE.test(toText(row[0]) ?? '')) break; // bloc suivant
      if (row.every((c) => isEmptyCell(c))) break; // ligne vide = fin de bloc
      const name = toText(row[1]);
      if (name) {
        exoRows.push({ row: j + 1, name });
        for (const col of [...CHARGE_COLS, ...REPS_COLS]) {
          if (!isFreeCell(row[col])) free = false;
        }
      }
      endRow = j + 1;
    }
    blocks.push({ titleRow: i + 1, endRow, exoRows, free });
    i = endRow - 1; // reprendre la boucle après le bloc
  }
  return blocks;
}

function ddmmyyyy(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export async function reportSessionToFullBody(
  provider: DataProvider,
  session: Session,
): Promise<FullBodyReport | null> {
  const wp = provider.writeProvision?.bind(provider);
  if (!wp) return null;
  const tabs = await provider.listSheets();
  if (!tabs.includes(SHEET_FULL_BODY)) return null;

  const grid = await provider.getRange(SHEET_FULL_BODY, 'A1:J1200');
  const blocks = findBlocks(grid);
  if (!blocks.length) return null; // onglet sans modèle — ne rien inventer

  let target = blocks.find((b) => b.free);
  let appendedBlock = false;

  if (!target) {
    // Duplique le dernier bloc (titre + en-têtes + lignes d'exos vides)
    // après une ligne vide de séparation.
    const src = blocks[blocks.length - 1]!;
    const srcRows = grid.slice(src.titleRow - 1, src.endRow);
    const titleRow = grid.length + 2;
    const template = srcRows.map((row, i) => {
      if (i === 0) return [toText(row[0]) ?? 'Full body'];
      return [...CHARGE_COLS, ...REPS_COLS].reduce(
        (r, col) => {
          // Lignes d'exos uniquement (i >= 3) : placeholders X.
          if (i >= 3 && toText(row[1])) r[col] = 'X';
          return r;
        },
        row.map((c, col) => (col === 0 && i !== 0 ? null : c)) as CellValue[],
      );
    });
    await wp(SHEET_FULL_BODY, `A${titleRow}:J${titleRow + template.length - 1}`, template);
    target = {
      titleRow,
      endRow: titleRow + template.length - 1,
      exoRows: src.exoRows.map((r) => ({
        row: r.row - src.titleRow + titleRow,
        name: r.name,
      })),
      free: true,
    };
    appendedBlock = true;
  }

  // Titre daté (le coach lit « Full body — 02/11/2026 »).
  await wp(SHEET_FULL_BODY, `A${target.titleRow}`, [[`Full body — ${ddmmyyyy(session.date)}`]]);

  // Remplit charge/rép par exercice (nom ↔ ligne du modèle).
  let cellsWritten = 0;
  const skipped: string[] = [];
  for (const ex of session.exercices) {
    const targetRow = target.exoRows.find((r) => r.name === ex.exercice);
    if (!targetRow) {
      skipped.push(ex.exercice);
      continue;
    }
    // Colonnes E..J : [charge1, rep1, charge2, rep2, charge3, rep3].
    const cells: CellValue[] = [];
    for (let s = 0; s < 3; s++) {
      const set = ex.sets[s];
      if (set?.terminee) {
        cells.push(set.chargeKg ?? '-', set.repetitions ?? '-');
      } else {
        cells.push('-', '-'); // série prévue mais non faite
      }
    }
    await wp(SHEET_FULL_BODY, `E${targetRow.row}:J${targetRow.row}`, [cells]);
    cellsWritten += cells.filter((c) => c !== '-').length;
  }

  return {
    blockTitleRow: target.titleRow,
    appendedBlock,
    cellsWritten,
    skippedExercises: skipped,
  };
}
