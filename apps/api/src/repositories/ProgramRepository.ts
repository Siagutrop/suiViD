import { randomUUID } from 'node:crypto';
import {
  SHEET_FULL_BODY,
  SHEET_PROGRAMMES,
  SHEET_PROGRAMME_EXERCICES,
  type Program,
  type ProgramExercise,
} from '@suivi/shared';
import { AppError, ERR } from '../errors.js';
import type { CellValue, DataProvider } from '../providers/DataProvider.js';
import { isEmptyCell, toNumber, toText } from './cells.js';

// ------------------------------------------------------------------
// Onglets normalisés (créés par le provisionnement explicite) :
//   Programmes          : id | nom | statut | cree_le | note
//   ProgrammeExercices  : programme_id | ordre | exercice | series |
//                         repetitions_cible | variante | notes | repos_sec
// L'onglet « Full body » n'est jamais modifié : il sert de modèle de
// départ et est importé dans ProgrammeExercices au provisionnement.
// ------------------------------------------------------------------

export class ProgramRepository {
  constructor(private readonly provider: DataProvider) {}

  private async ensureTabs() {
    const tabs = await this.provider.listSheets();
    const missing = [SHEET_PROGRAMMES, SHEET_PROGRAMME_EXERCICES].filter(
      (t) => !tabs.includes(t),
    );
    if (missing.length) {
      throw new AppError(
        409,
        ERR.TABS_MISSING,
        `Onglets manquants : ${missing.join(', ')}. ` +
          'Exécutez le provisionnement (npm run api:setup-sheets) avant de modifier les programmes.',
      );
    }
  }

  async list(): Promise<Program[]> {
    await this.ensureTabs();
    const [progs, exos] = await Promise.all([
      this.provider.getRange(SHEET_PROGRAMMES, 'A2:E500'),
      this.provider.getRange(SHEET_PROGRAMME_EXERCICES, 'A2:H1000'),
    ]);
    const byProgram = new Map<string, { ordre: number; ex: ProgramExercise }[]>();
    for (const row of exos) {
      const pid = toText(row[0]);
      if (!pid) continue;
      const ex: ProgramExercise = {
        exercice: toText(row[2]) ?? '',
        series: toNumber(row[3]) ?? 3,
        repsCible: toText(row[4]),
        variante: toText(row[5]),
        notes: toText(row[6]),
        reposSec: toNumber(row[7]),
      };
      if (!byProgram.has(pid)) byProgram.set(pid, []);
      byProgram.get(pid)!.push({ ordre: toNumber(row[1]) ?? 0, ex });
    }
    return progs
      .map((row) => {
        const id = toText(row[0]);
        if (!id) return null;
        const exercices = (byProgram.get(id) ?? [])
          .sort((a, b) => a.ordre - b.ordre)
          .map((x) => x.ex);
        return {
          id,
          nom: toText(row[1]) ?? 'Programme',
          statut: (toText(row[2]) === 'archive' ? 'archive' : 'actif') as Program['statut'],
          creeLe: toText(row[3]) ?? '',
          note: toText(row[4]),
          exercices,
        } satisfies Program;
      })
      .filter((p): p is Program => p !== null);
  }

  async get(id: string): Promise<Program> {
    const p = (await this.list()).find((x) => x.id === id);
    if (!p) throw new AppError(404, ERR.NOT_FOUND, `Programme introuvable : ${id}`);
    return p;
  }

  /** Crée un programme (append dans les deux onglets). */
  async create(input: { nom: string; note?: string | null; exercices: ProgramExercise[] }): Promise<Program> {
    await this.ensureTabs();
    const id = `prog_${randomUUID().slice(0, 8)}`;
    await this.provider.appendRows(SHEET_PROGRAMMES, [
      [id, input.nom, 'actif', new Date().toISOString().slice(0, 10), input.note ?? null],
    ]);
    if (input.exercices.length) {
      await this.provider.appendRows(
        SHEET_PROGRAMME_EXERCICES,
        input.exercices.map((e, i) => [
          id,
          i + 1,
          e.exercice,
          e.series,
          e.repsCible ?? null,
          e.variante ?? null,
          e.notes ?? null,
          e.reposSec ?? null,
        ]),
      );
    }
    return this.get(id);
  }

  async duplicate(id: string): Promise<Program> {
    const src = await this.get(id);
    return this.create({
      nom: `${src.nom} (copie)`,
      note: src.note,
      exercices: src.exercices,
    });
  }

  /**
   * Met à jour un programme : réécrit la ligne Programmes + remplace
   * ses lignes ProgrammeExercices. Réécriture du bloc complet de
   * l'onglet exercices (petit volume) après lecture — les lignes des
   * autres programmes sont conservées à l'identique.
   */
  async update(
    id: string,
    input: {
      nom?: string;
      statut?: 'actif' | 'archive';
      note?: string | null;
      exercices?: ProgramExercise[];
    },
  ): Promise<Program> {
    await this.ensureTabs();
    const all = await this.list();
    const target = all.find((p) => p.id === id);
    if (!target) throw new AppError(404, ERR.NOT_FOUND, `Programme introuvable : ${id}`);

    // Mise à jour de l'onglet Programmes (ligne entière).
    const progs = await this.provider.getRange(SHEET_PROGRAMMES, 'A2:E500');
    const rowIdx = progs.findIndex((r) => toText(r[0]) === id);
    if (rowIdx >= 0) {
      const merged = {
        nom: input.nom ?? target.nom,
        statut: input.statut ?? target.statut,
        note: input.note !== undefined ? input.note : target.note,
      };
      await this.provider.updateRange(SHEET_PROGRAMMES, `A${rowIdx + 2}:E${rowIdx + 2}`, [
        [id, merged.nom, merged.statut, target.creeLe, merged.note],
      ]);
    }

    // Remplacement des exercices : reconstruction de tout le corps
    // de l'onglet (ordre préservé, autres programmes inchangés).
    if (input.exercices) {
      const rows: CellValue[][] = [];
      for (const p of all) {
        const list = p.id === id ? input.exercices : p.exercices;
        list.forEach((e, i) => {
          rows.push([
            p.id,
            i + 1,
            e.exercice,
            e.series,
            e.repsCible ?? null,
            e.variante ?? null,
            e.notes ?? null,
            e.reposSec ?? null,
          ]);
        });
      }
      const current = await this.provider.getRange(SHEET_PROGRAMME_EXERCICES, 'A2:H1000');
      const blankRows = Math.max(0, current.length - rows.length);
      const padded = [...rows, ...Array.from({ length: blankRows }, () => Array(8).fill(null))];
      await this.provider.updateRange(
        SHEET_PROGRAMME_EXERCICES,
        `A2:H${1 + padded.length}`,
        padded,
      );
    }

    return this.get(id);
  }

  /** Archive (soft delete) — l'historique des séances reste lisible. */
  async archive(id: string): Promise<Program> {
    return this.update(id, { statut: 'archive' });
  }

  /**
   * Importe le premier bloc « Full body » comme programme initial.
   * Appelé uniquement par le provisionnement explicite.
   * Structure attendue du bloc : titre, en-têtes, puis lignes d'exercices
   * avec 'X' dans les colonnes de charge pour chaque série prévue.
   */
  async importFullBodyTemplate(): Promise<Program | null> {
    const tabs = await this.provider.listSheets();
    if (!tabs.includes(SHEET_FULL_BODY)) return null;
    const grid = await this.provider.getRange(SHEET_FULL_BODY, 'A1:J60');
    const exercices: ProgramExercise[] = [];
    let inFirstBlock = false;
    for (const row of grid) {
      if (toText(row[0]) === 'Full body') {
        if (inFirstBlock) break; // fin du premier bloc
        inFirstBlock = true;
        continue;
      }
      if (!inFirstBlock) continue;
      const nom = toText(row[1]);
      if (!nom || nom === "Nom de l'exercice" || nom === 'Exercice') continue;
      // Colonnes E (charge S1), G (charge S2), I (charge S3) : un « X »
      // marque une série prévue dans le modèle d'origine.
      let series = 0;
      for (const col of [4, 6, 8]) {
        if (!isEmptyCell(row[col])) series++;
      }
      exercices.push({
        exercice: nom,
        series: Math.max(series, 1),
        repsCible: '8-12',
        variante: toText(row[3]),
        notes: null,
        reposSec: null,
      });
    }
    if (!exercices.length) return null;
    return this.create({ nom: 'Full body', note: 'Importé depuis l’onglet Full body', exercices });
  }
}
