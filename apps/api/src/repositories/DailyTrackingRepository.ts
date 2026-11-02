import {
  EMPTY_PLACEHOLDER,
  JOURNAL_FIELDS,
  JOURNAL_FIRST_DATA_ROW,
  JOURNAL_WRITABLE_FIRST_COL,
  JOURNAL_WRITABLE_LAST_COL,
  parseSheetDate,
  SHEET_SUIVI,
  todayInTimezone,
  type ConflictInfo,
  type JournalEntry,
  type JournalValues,
  type TodayResponse,
} from '@suivi/shared';
import { AppError, ERR } from '../errors.js';
import { indexToCol } from '../providers/a1.js';
import type { DataProvider, Grid } from '../providers/DataProvider.js';
import { isEmptyCell, sameValue, toNumber, toText } from './cells.js';

const MAX_SCAN_ROWS = 500;

// ------------------------------------------------------------------
// Règles de sécurité du Journal (appliquées côté serveur) :
//  - écriture uniquement sur la ligne correspondant à la date du jour
//    (fuseau Europe/Paris, configurable) ;
//  - uniquement les colonnes C..K — A et B sont intouchables ;
//  - aucune création automatique de ligne manquante ;
//  - relecture avant écriture + détection de conflit (base vs courant) ;
//  - seules les cellules réellement modifiées sont écrites.
// ------------------------------------------------------------------

export class DailyTrackingRepository {
  constructor(
    private readonly provider: DataProvider,
    private readonly timezone: string,
  ) {}

  private today(): string {
    return todayInTimezone(this.timezone);
  }

  /** Lit les lignes A..K et retourne [rowIndex(1-based), entrée] pour chaque ligne datée. */
  private async readTable(): Promise<{ rowIndex: number; entry: JournalEntry }[]> {
    const grid = await this.provider.getRange(
      SHEET_SUIVI,
      `A${JOURNAL_FIRST_DATA_ROW}:K${MAX_SCAN_ROWS}`,
    );
    return grid
      .map((row, i) => ({ rowIndex: JOURNAL_FIRST_DATA_ROW + i, entry: this.rowToEntry(row) }))
      .filter((r): r is { rowIndex: number; entry: JournalEntry } => r.entry !== null);
  }

  private rowToEntry(row: Grid[number] | undefined): JournalEntry | null {
    if (!row) return null;
    const date = parseSheetDate(row[0]);
    if (!date) return null;
    return {
      date,
      week: toNumber(row[1]),
      sommeil: toNumber(row[2]),
      forme: toNumber(row[3]),
      poids: toNumber(row[4]),
      calories: toNumber(row[5]),
      glucides: toNumber(row[6]),
      proteines: toNumber(row[7]),
      lipides: toNumber(row[8]),
      pas: toNumber(row[9]),
      entrainement: toText(row[10]),
    };
  }

  /** Journal du jour (peut être vide). rowMissing=true si aucune ligne ne correspond. */
  async getToday(): Promise<TodayResponse> {
    const today = this.today();
    const table = await this.readTable();
    const found = table.find((r) => r.entry.date === today);
    if (!found) {
      return {
        rowMissing: true,
        rowIndex: null,
        entry: {
          date: today,
          week: null,
          sommeil: null,
          forme: null,
          poids: null,
          calories: null,
          glucides: null,
          proteines: null,
          lipides: null,
          pas: null,
          entrainement: null,
        },
      };
    }
    return { rowMissing: false, rowIndex: found.rowIndex, entry: found.entry };
  }

  /** Historique en lecture seule entre deux dates incluses (tri asc). */
  async getRange(from: string, to: string): Promise<JournalEntry[]> {
    const table = await this.readTable();
    return table
      .map((r) => r.entry)
      .filter((e) => e.date >= from && e.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Dernières entrées remplies (pour l'accueil). */
  async getRecent(limit: number): Promise<JournalEntry[]> {
    const table = await this.readTable();
    return table
      .map((r) => r.entry)
      .filter((e) => e.date <= this.today())
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit);
  }

  /**
   * Écrit le journal du jour.
   * @param values valeurs à écrire (clés subset autorisé)
   * @param base   valeurs lues par le client au chargement — détection de conflit
   * @param force  true = écraser malgré les divergences (confirmé par l'utilisateur)
   */
  async updateToday(
    values: Partial<JournalValues>,
    base?: Partial<JournalValues>,
    force = false,
  ): Promise<{ entry: JournalEntry; written: (keyof JournalValues)[] }> {
    const today = this.today();

    // Relecture systématique avant écriture.
    const table = await this.readTable();
    const found = table.find((r) => r.entry.date === today);
    if (!found) {
      // Jamais de création automatique de ligne.
      throw new AppError(
        404,
        ERR.ROW_MISSING,
        `Aucune ligne n'existe pour le ${today} dans l'onglet Suivi. ` +
          'Ajoutez-la dans Google Sheets puis réessayez.',
      );
    }
    const { rowIndex, entry: current } = found;

    // Détection de conflit : si `base` est fournie, toute cellule dont la
    // valeur courante diffère de la base est un conflit. Si `base` est
    // absente, modifier une cellule déjà remie est aussi un conflit
    // (le client ne peut pas avoir vu la valeur).
    const conflicts: (keyof JournalValues)[] = [];
    for (const key of JOURNAL_FIELDS) {
      const next = values[key];
      if (next === undefined) continue; // clé non envoyée -> cellule non modifiée
      const cur = current[key];
      if (base && key in base) {
        if (!sameValue(cur, base[key] ?? null)) conflicts.push(key);
      } else if (cur !== null && !sameValue(cur, next)) {
        conflicts.push(key);
      }
    }
    if (conflicts.length && !force) {
      const info: ConflictInfo = {
        current: pick(current),
        expected: base ? pick(base as JournalValues) : pick(current),
      };
      throw new AppError(
        409,
        ERR.CONFLICT,
        `Des valeurs ont changé depuis votre lecture (champs : ${conflicts.join(', ')}). ` +
          'Rechargez ou confirmez l’écrasement.',
        info,
      );
    }

    // N'écrire que les cellules réellement modifiées — une requête batch
    // de plages unitaires, limitée aux colonnes C..K.
    const updates: { range: string; values: (string | number)[][] }[] = [];
    const written: (keyof JournalValues)[] = [];
    JOURNAL_FIELDS.forEach((key, i) => {
      const next = values[key];
      if (next === undefined) return;
      if (sameValue(next, current[key])) return; // pas de changement -> pas d'écriture
      const col = JOURNAL_WRITABLE_FIRST_COL + i;
      if (col < JOURNAL_WRITABLE_FIRST_COL || col > JOURNAL_WRITABLE_LAST_COL) {
        throw new AppError(500, ERR.FORBIDDEN_RANGE, `Colonne hors plage : ${col}`);
      }
      const cellValue = next === null ? EMPTY_PLACEHOLDER : next;
      updates.push({ range: `${indexToCol(col)}${rowIndex}`, values: [[cellValue]] });
      written.push(key);
    });

    if (updates.length) {
      await this.provider.batchUpdate(SHEET_SUIVI, updates);
    }

    const merged: JournalEntry = { ...current };
    for (const key of written) {
      // @ts-expect-error affectation champ par champ
      merged[key] = values[key] ?? null;
    }
    return { entry: merged, written };
  }
}

function pick(v: JournalValues): JournalValues {
  const out = {} as JournalValues;
  for (const k of JOURNAL_FIELDS) {
    // @ts-expect-error indexation par clé de champ
    out[k] = v[k] ?? null;
  }
  return out;
}

/** Helper : true si la cellule brute est vide (utilisé par les tests). */
export { isEmptyCell };
