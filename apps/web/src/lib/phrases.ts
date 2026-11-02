// Phrase du jour — message contextuel déterministe, affiché sur l'accueil.
// Priorité aux infos du jour (calories, forme…), sinon rotation quotidienne.

import type { JournalEntry } from '@suivi/shared';
import { formatNum } from '@/lib/utils';

const POOL = [
  'Chaque séance compte — la régularité bat la motivation.',
  'Un jour à la fois, un repas à la fois.',
  'Le corps réalise ce que l’esprit croit.',
  'Discipline > motivation. Toujours.',
  'Tu n’as pas besoin d’être parfait, juste constant.',
  'La sueur d’aujourd’hui est la force de demain.',
  'Petits efforts quotidiens, grands résultats annuels.',
  'Ton futur toi te remercie pour aujourd’hui.',
];

/** Phrase contextuelle pour l'accueil — change chaque jour, réagit aux données. */
export function phraseDuJour(
  entry: JournalEntry | undefined,
  objectifCalories: number | null,
  streak: number,
  jourAnnee: number,
): string {
  const eaten = entry?.calories ?? null;
  const restant = objectifCalories != null && eaten != null ? objectifCalories - eaten : null;

  if (entry?.forme != null && entry.forme <= 4) {
    return `Forme à ${entry.forme}/10 — écoute ton corps, hydratation et douceur aujourd'hui.`;
  }
  if (restant != null && restant < 0) {
    return `${formatNum(-restant)} kcal au-dessus de l'objectif — pas de panique, on réajuste au prochain repas.`;
  }
  if (restant != null && eaten != null && eaten > 0 && restant > objectifCalories! * 0.5) {
    return `Il te reste ${formatNum(restant)} kcal — pense à manger suffisamment pour tenir la masse.`;
  }
  if (restant != null && restant >= 0 && restant <= objectifCalories! * 0.15) {
    return `Plus que ${formatNum(restant)} kcal de marge — journée nutrition quasi parfaite.`;
  }
  if (streak >= 7) return `${streak} jours de suivi d'affilée — cette régularité est ton meilleur atout.`;
  if (streak >= 3) return `${streak} jours de suivi d'affilée — la machine est lancée.`;
  if (eaten == null) return "Pense à saisir tes calories du jour pour garder le cap.";
  return POOL[jourAnnee % POOL.length]!;
}
