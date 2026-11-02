import { SHEET_LISTE, type Exercise } from '@suivi/shared';
import type { DataProvider } from '../providers/DataProvider.js';
import { toText } from './cells.js';

// Corrige le libellé « Trices » présent dans l'onglet Liste (faute de
// frappe dans le fichier source) pour le regroupement par muscle.
// La valeur brute n'est jamais modifiée dans le classeur (lecture seule).
export function normalizeMuscle(muscle: string | null): string {
  if (!muscle) return 'Autre';
  const m = muscle.trim();
  return m === 'Trices' ? 'Triceps' : m;
}

/** Onglet Liste — lecture seule. ~92 exercices : Nom | Muscle | Lien vidéo. */
export class ExerciseRepository {
  constructor(private readonly provider: DataProvider) {}

  async list(): Promise<Exercise[]> {
    const grid = await this.provider.getRange(SHEET_LISTE, 'A2:C200');
    return grid
      .map((row) => ({
        nom: toText(row[0]) ?? '',
        muscle: normalizeMuscle(toText(row[1])),
        videoUrl: toText(row[2]),
      }))
      .filter((e) => e.nom !== '');
  }
}
