import { SHEET_EXOS_PERSO, SHEET_LISTE, type Exercise } from '@suivi/shared';
import { AppError, ERR } from '../errors.js';
import type { CellValue, DataProvider } from '../providers/DataProvider.js';
import { toText } from './cells.js';

// Corrige le libellé « Trices » présent dans l'onglet Liste (faute de
// frappe dans le fichier source) pour le regroupement par muscle.
// La valeur brute n'est jamais modifiée dans le classeur (lecture seule).
export function normalizeMuscle(muscle: string | null): string {
  if (!muscle) return 'Autre';
  const m = muscle.trim();
  return m === 'Trices' ? 'Triceps' : m;
}

interface PersoRow {
  r: number;
  nom: string;
  muscle: string;
  tag: string | null;
  video: string | null;
}

export interface PersoExerciseInput {
  nom: string;
  muscle: string;
  tag: string | null;
  videoUrl: string | null;
}

const PERSO_HEADER = ['Nom', 'Muscle', 'Tag', 'Lien vidéo'];

/** Onglet Liste — lecture seule. ~92 exercices : Nom | Muscle | Lien vidéo. */
export class ExerciseRepository {
  constructor(private readonly provider: DataProvider) {}

  /**
   * Bibliothèque complète : onglet global « Liste » (partagé, géré par
   * le coach) + exercices personnels de l'utilisateur (ExosPerso).
   */
  async list(): Promise<Exercise[]> {
    const grid = await this.provider.getRange(SHEET_LISTE, 'A2:C200');
    const globaux = grid
      .map((row) => ({
        nom: toText(row[0]) ?? '',
        muscle: normalizeMuscle(toText(row[1])),
        videoUrl: toText(row[2]),
      }))
      .filter((e) => e.nom !== '');
    const persos = (await this.persoRows()).map(
      (r): Exercise => ({
        nom: r.nom,
        muscle: normalizeMuscle(r.muscle),
        videoUrl: r.video,
        tag: r.tag,
        perso: true,
      }),
    );
    return [...globaux, ...persos];
  }

  // ---------- Exercices personnels ----------

  /** Existence de l'onglet, mise en cache (une requête par instance). */
  private persoExists: boolean | undefined;
  private async hasPersoSheet(): Promise<boolean> {
    if (this.persoExists === undefined) {
      this.persoExists = (await this.provider.listSheets()).includes(SHEET_EXOS_PERSO);
    }
    return this.persoExists;
  }

  /** Lit ExosPerso — onglet par utilisateur, créé à la première création. */
  private async persoRows(): Promise<PersoRow[]> {
    if (!(await this.hasPersoSheet())) return [];
    const grid = await this.provider.getRange(SHEET_EXOS_PERSO, 'A2:D500');
    return grid
      .map((row, i): PersoRow => ({
        r: i + 2,
        nom: toText(row[0]) ?? '',
        muscle: toText(row[1]) ?? 'Autre',
        tag: toText(row[2]),
        video: toText(row[3]),
      }))
      .filter((r) => r.nom !== '');
  }

  private async ensurePersoSheet() {
    if (!(await this.hasPersoSheet())) {
      await this.provider.createSheet(SHEET_EXOS_PERSO);
      await this.provider.updateRange(SHEET_EXOS_PERSO, 'A1:D1', [PERSO_HEADER as CellValue[]]);
      this.persoExists = true;
    }
  }

  async createPerso(input: PersoExerciseInput): Promise<Exercise> {
    const nom = input.nom.trim();
    const muscle = input.muscle.trim() || 'Autre';
    const tag = input.tag?.trim() || null;
    const videoUrl = input.videoUrl?.trim() || null;
    const tous = await this.list();
    if (tous.some((e) => e.nom.toLowerCase() === nom.toLowerCase())) {
      throw new AppError(409, ERR.VALIDATION, 'Un exercice porte déjà ce nom');
    }
    await this.ensurePersoSheet();
    await this.provider.appendRows(SHEET_EXOS_PERSO, [[nom, muscle, tag, videoUrl]]);
    return { nom, muscle: normalizeMuscle(muscle), videoUrl, tag, perso: true };
  }

  async updatePerso(nom: string, input: PersoExerciseInput): Promise<Exercise> {
    const rows = await this.persoRows();
    const row = rows.find((r) => r.nom === nom);
    if (!row) throw new AppError(404, ERR.NOT_FOUND, 'Exercice perso introuvable');
    const newNom = input.nom.trim();
    if (newNom.toLowerCase() !== nom.toLowerCase()) {
      const tous = await this.list();
      if (tous.some((e) => e.nom.toLowerCase() === newNom.toLowerCase())) {
        throw new AppError(409, ERR.VALIDATION, 'Un exercice porte déjà ce nom');
      }
    }
    const muscle = input.muscle.trim() || 'Autre';
    const tag = input.tag?.trim() || null;
    const videoUrl = input.videoUrl?.trim() || null;
    await this.provider.updateRange(SHEET_EXOS_PERSO, `A${row.r}:D${row.r}`, [
      [newNom, muscle, tag, videoUrl],
    ]);
    return { nom: newNom, muscle: normalizeMuscle(muscle), videoUrl, tag, perso: true };
  }

  async removePerso(nom: string): Promise<{ ok: true }> {
    const rows = await this.persoRows();
    const kept = rows.filter((r) => r.nom !== nom);
    if (kept.length === rows.length) {
      throw new AppError(404, ERR.NOT_FOUND, 'Exercice perso introuvable');
    }
    // Réécrit tout le corps sur la largeur occupée : lignes blanches à
    // la fin effacent les reliquats (même si le corps avait des trous).
    const last = rows[rows.length - 1]!.r;
    const body: CellValue[][] = kept.map((r) => [r.nom, r.muscle, r.tag, r.video]);
    while (body.length < last - 1) body.push([null, null, null, null]);
    await this.provider.updateRange(SHEET_EXOS_PERSO, `A2:D${last}`, body);
    return { ok: true };
  }
}
