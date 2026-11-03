import { WRITABLE_SHEETS } from '@suivi/shared';
import { AppError, ERR } from '../errors.js';
import { GLOBAL_SHEETS, type Db } from '../db.js';
import { parseA1 } from './a1.js';
import type { CellValue, DataProvider, Grid, RangeUpdate } from './DataProvider.js';

const WRITABLE = new Set<string>(WRITABLE_SHEETS);

interface CellRow {
  r: number;
  c: number;
  t: 's' | 'n' | 'b';
  v: string | null;
  n: number | null;
}

/**
 * DataProvider adossé à SQLite — reproduit la sémantique Google Sheets
 * (plages A1, cellules vides = null, append, whitelist d'écriture) afin
 * que tous les repositories fonctionnent à l'identique.
 *
 * Un provider par utilisateur : les onglets applicatifs sont scopés par
 * userId ; `Liste` (bibliothèque d'exercices) vit dans le scope 'global'
 * et est donc partagée — le coach la gère pour tout le monde.
 */
export class SqliteProvider implements DataProvider {
  constructor(
    private db: Db,
    private userId: string,
  ) {}

  private scope(sheet: string) {
    return GLOBAL_SHEETS.has(sheet) ? 'global' : this.userId;
  }

  private assertWritable(sheet: string) {
    if (!WRITABLE.has(sheet)) {
      throw new AppError(403, ERR.FORBIDDEN_SHEET, `Écriture interdite sur l'onglet « ${sheet} »`);
    }
  }

  private assertExists(sheet: string) {
    const row = this.db
      .prepare('SELECT 1 FROM sheets WHERE scope = ? AND name = ?')
      .get(this.scope(sheet), sheet);
    if (!row) throw new AppError(404, ERR.NOT_FOUND, `Onglet inexistant : ${sheet}`);
  }

  async listSheets(): Promise<string[]> {
    const rows = this.db
      .prepare('SELECT name FROM sheets WHERE scope IN (?, \'global\') ORDER BY name')
      .all(this.userId) as { name: string }[];
    return rows.map((r) => r.name);
  }

  async getRange(sheet: string, a1: string): Promise<Grid> {
    this.assertExists(sheet);
    const { colStart, rowStart, colEnd, rowEnd } = parseA1(a1);
    const rows = this.db
      .prepare(
        'SELECT r, c, t, v, n FROM cells WHERE scope = ? AND sheet = ? AND r BETWEEN ? AND ? AND c BETWEEN ? AND ?',
      )
      .all(this.scope(sheet), sheet, rowStart, rowEnd, colStart, colEnd) as CellRow[];
    const map = new Map<string, CellRow>();
    for (const row of rows) map.set(`${row.r}:${row.c}`, row);
    const out: Grid = [];
    for (let r = rowStart; r <= rowEnd; r++) {
      const line: CellValue[] = [];
      for (let c = colStart; c <= colEnd; c++) {
        const cell = map.get(`${r}:${c}`);
        if (!cell) line.push(null);
        else if (cell.t === 'n') line.push(cell.n);
        else if (cell.t === 'b') line.push(cell.n === 1);
        else line.push(cell.v ?? '');
      }
      out.push(line);
    }
    return out;
  }

  private writeCells(scope: string, sheet: string, rowStart: number, colStart: number, values: CellValue[][]) {
    const ins = this.db.prepare(
      'INSERT INTO cells (scope, sheet, r, c, t, v, n) VALUES (?, ?, ?, ?, ?, ?, ?) ' +
        'ON CONFLICT (scope, sheet, r, c) DO UPDATE SET t = excluded.t, v = excluded.v, n = excluded.n',
    );
    const del = this.db.prepare('DELETE FROM cells WHERE scope = ? AND sheet = ? AND r = ? AND c = ?');
    values.forEach((row, ri) => {
      row.forEach((value, ci) => {
        const r = rowStart + ri;
        const c = colStart + ci;
        if (value == null) {
          del.run(scope, sheet, r, c);
        } else if (typeof value === 'number') {
          ins.run(scope, sheet, r, c, 'n', null, value);
        } else if (typeof value === 'boolean') {
          ins.run(scope, sheet, r, c, 'b', null, value ? 1 : 0);
        } else {
          ins.run(scope, sheet, r, c, 's', value, null);
        }
      });
    });
  }

  async updateRange(sheet: string, a1: string, values: CellValue[][]): Promise<void> {
    this.assertWritable(sheet);
    this.assertExists(sheet);
    const { colStart, rowStart } = parseA1(a1);
    this.db.transaction(() => this.writeCells(this.scope(sheet), sheet, rowStart, colStart, values))();
  }

  async batchUpdate(sheet: string, updates: RangeUpdate[]): Promise<void> {
    this.assertWritable(sheet);
    this.assertExists(sheet);
    this.db.transaction(() => {
      for (const u of updates) {
        const { colStart, rowStart } = parseA1(u.range);
        this.writeCells(this.scope(sheet), sheet, rowStart, colStart, u.values);
      }
    })();
  }

  async appendRows(sheet: string, values: CellValue[][]): Promise<void> {
    this.assertWritable(sheet);
    this.assertExists(sheet);
    const scope = this.scope(sheet);
    // append après la dernière ligne contenant une valeur non vide
    const last =
      (this.db
        .prepare(
          "SELECT MAX(r) AS m FROM cells WHERE scope = ? AND sheet = ? AND NOT (t = 's' AND v = '')",
        )
        .get(scope, sheet) as { m: number | null }).m ?? 0;
    this.db.transaction(() => this.writeCells(scope, sheet, last + 1, 1, values))();
  }

  async createSheet(sheet: string): Promise<void> {
    this.db
      .prepare('INSERT OR IGNORE INTO sheets (scope, name) VALUES (?, ?)')
      .run(this.scope(sheet), sheet);
  }

  /** Provisionnement : comme updateRange mais sans la whitelist. */
  async writeProvision(sheet: string, a1: string, values: CellValue[][]): Promise<void> {
    this.assertExists(sheet);
    const { colStart, rowStart } = parseA1(a1);
    this.db.transaction(() => this.writeCells(this.scope(sheet), sheet, rowStart, colStart, values))();
  }
}
