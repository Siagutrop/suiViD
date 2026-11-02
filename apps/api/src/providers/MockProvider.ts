import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { WRITABLE_SHEETS } from '@suivi/shared';
import { AppError, ERR } from '../errors.js';
import { parseA1 } from './a1.js';
import type { CellValue, DataProvider, Grid, RangeUpdate } from './DataProvider.js';

const WRITABLE = new Set<string>(WRITABLE_SHEETS);

/**
 * Provider en mémoire qui reproduit la sémantique de Google Sheets :
 * grille de cellules par onglet, lectures/écritures par plages A1,
 * append à la fin du tableau.
 *
 * Utilisé pour le mode démo et les tests. Persistance facultative dans
 * un fichier JSON local (jamais synchronisé vers Google).
 */
export class MockProvider implements DataProvider {
  private sheets: Map<string, CellValue[][]>;
  private storeFile?: string;

  constructor(initial: Record<string, CellValue[][]>, storeFile?: string) {
    this.storeFile = storeFile;
    if (storeFile && existsSync(storeFile)) {
      try {
        const disk = JSON.parse(readFileSync(storeFile, 'utf-8'));
        this.sheets = new Map(Object.entries(disk));
        return;
      } catch {
        // fichier corrompu -> on repart du seed
      }
    }
    this.sheets = new Map(Object.entries(initial).map(([k, v]) => [k, v.map((r) => [...r])]));
  }

  private persist() {
    if (!this.storeFile) return;
    mkdirSync(dirname(this.storeFile), { recursive: true });
    writeFileSync(this.storeFile, JSON.stringify(Object.fromEntries(this.sheets)), 'utf-8');
  }

  private grid(sheet: string): CellValue[][] {
    const g = this.sheets.get(sheet);
    if (!g) throw new AppError(404, ERR.NOT_FOUND, `Onglet inexistant : ${sheet}`);
    return g;
  }

  private assertWritable(sheet: string) {
    if (!WRITABLE.has(sheet)) {
      throw new AppError(
        403,
        ERR.FORBIDDEN_SHEET,
        `Écriture interdite sur l'onglet « ${sheet} »`,
      );
    }
  }

  async listSheets(): Promise<string[]> {
    return [...this.sheets.keys()];
  }

  async getRange(sheet: string, a1: string): Promise<Grid> {
    const g = this.grid(sheet);
    const { colStart, rowStart, colEnd, rowEnd } = parseA1(a1);
    const out: Grid = [];
    for (let r = rowStart; r <= rowEnd; r++) {
      const row: CellValue[] = [];
      for (let c = colStart; c <= colEnd; c++) {
        row.push(g[r - 1]?.[c - 1] ?? null);
      }
      out.push(row);
    }
    return out;
  }

  async updateRange(sheet: string, a1: string, values: CellValue[][]): Promise<void> {
    this.assertWritable(sheet);
    const g = this.grid(sheet);
    const { colStart, rowStart } = parseA1(a1);
    values.forEach((row, ri) => {
      const r = rowStart + ri - 1;
      while (g.length <= r) g.push([]);
      row.forEach((v, ci) => {
        g[r]![colStart + ci - 1] = v;
      });
    });
    this.persist();
  }

  async batchUpdate(sheet: string, updates: RangeUpdate[]): Promise<void> {
    this.assertWritable(sheet);
    for (const u of updates) await this.updateRange(sheet, u.range, u.values);
  }

  async appendRows(sheet: string, values: CellValue[][]): Promise<void> {
    this.assertWritable(sheet);
    const g = this.grid(sheet);
    // append après la dernière ligne non vide
    let last = g.length;
    while (last > 0 && (g[last - 1]?.every((v) => v == null || v === '') ?? true)) last--;
    g.length = last;
    for (const row of values) g.push([...row]);
    this.persist();
  }

  async createSheet(sheet: string): Promise<void> {
    if (!this.sheets.has(sheet)) {
      this.sheets.set(sheet, []);
      this.persist();
    }
  }

  /** Provisionnement : comme updateRange mais sans la whitelist. */
  async writeProvision(sheet: string, a1: string, values: CellValue[][]): Promise<void> {
    const g = this.grid(sheet);
    const { colStart, rowStart } = parseA1(a1);
    values.forEach((row, ri) => {
      const r = rowStart + ri - 1;
      while (g.length <= r) g.push([]);
      row.forEach((v, ci) => {
        g[r]![colStart + ci - 1] = v;
      });
    });
    this.persist();
  }
}
