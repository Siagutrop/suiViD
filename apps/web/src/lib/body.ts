// Morphologie de la silhouette affichée dans la fiche exercice et la heat map.
// Préférence locale à l'appareil (comme le thème) — modèles MuscleMapJS.

import type { BodyGender } from '@/vendor/musclemap/index';

export const GENDERS = [
  { id: 'male' as const, nom: 'Homme', desc: 'Silhouette masculine' },
  { id: 'female' as const, nom: 'Femme', desc: 'Silhouette féminine' },
];

export type BuildId = BodyGender;

const KEY = 'suivid:body';
const IDS = new Set<string>(GENDERS.map((g) => g.id));

export function getBuild(): BuildId {
  try {
    const b = localStorage.getItem(KEY);
    if (b && IDS.has(b)) return b as BuildId;
  } catch {
    /* stockage indisponible */
  }
  return 'male';
}

export function setBuild(id: BuildId) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* stockage indisponible */
  }
}
