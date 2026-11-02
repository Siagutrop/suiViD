import type { SessionExercise } from '@suivi/shared';

// ------------------------------------------------------------------
// Brouillon local de séance active — survit à un rechargement.
// Tant que POST /api/seances n'a pas confirmé, le brouillon est marqué
// « non synchronisé » dans l'interface et conservé ici.
// ------------------------------------------------------------------

const KEY = 'suivid.sessionDraft';

export interface SessionDraft {
  programmeId: string | null;
  programmeNom: string;
  debut: string; // ISO — conservé pour l'enregistrement
  exercices: SessionExercise[];
  notes: string | null;
  /** Index de l'exercice affiché. */
  index: number;
}

export function loadDraft(): SessionDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SessionDraft;
    if (!d.programmeNom || !Array.isArray(d.exercices)) return null;
    return d;
  } catch {
    return null;
  }
}

export function saveDraft(d: SessionDraft | null) {
  if (d) localStorage.setItem(KEY, JSON.stringify(d));
  else localStorage.removeItem(KEY);
}
