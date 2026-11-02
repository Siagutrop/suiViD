// Récompenses calculées depuis les données réelles (journal + séances).
// Aucun stockage nécessaire : un badge est débloqué quand sa condition est remplie.
// Les badges « vus » sont mémorisés en local pour afficher l'étiquette « Nouveau ! ».

import type { JournalEntry, Session, UserSettings } from '@suivi/shared';

export interface Badge {
  id: string;
  nom: string;
  desc: string;
  icon: string; // nom d'icône Lucide résolu côté UI
  /** 0–1 progression vers le déblocage */
  progression: number;
  debloque: boolean;
  valeur: number;
  seuil: number;
}

const SEEN_KEY = 'suivid:badges-seen';

export function getSeenBadges(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function markBadgesSeen(ids: string[]) {
  const seen = getSeenBadges();
  for (const id of ids) seen.add(id);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    /* stockage indisponible */
  }
}

function mk(id: string, nom: string, desc: string, icon: string, valeur: number, seuil: number): Badge {
  return { id, nom, desc, icon, progression: Math.min(1, seuil > 0 ? valeur / seuil : 0), debloque: valeur >= seuil, valeur, seuil };
}

/** Jours consécutifs (en remontant depuis aujourd'hui) avec journal rempli. */
export function streakJours(entries: JournalEntry[], today: string): number {
  const done = new Set(entries.filter((e) => e.calories != null || e.poids != null).map((e) => e.date));
  let n = 0;
  const d = new Date(`${today}T12:00:00`);
  // Le jour même peut ne pas être saisi : on commence à hier sans casser la série.
  if (!done.has(today)) d.setDate(d.getDate() - 1);
  for (;;) {
    const key = d.toISOString().slice(0, 10);
    if (!done.has(key)) break;
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function computeBadges(
  entries: JournalEntry[],
  seances: Session[],
  settings: UserSettings | undefined,
  today: string,
): Badge[] {
  const streak = streakJours(entries, today);
  const nbSeances = seances.filter((s) => s.statut === 'terminee').length;
  const objProt = settings?.objectifProteines ?? null;
  const objPas = settings?.objectifPas ?? null;
  const joursProt = objProt != null ? entries.filter((e) => e.proteines != null && e.proteines >= objProt).length : 0;
  const joursPas = objPas != null ? entries.filter((e) => e.pas != null && e.pas >= objPas).length : 0;
  const nuitsLongues = entries.filter((e) => e.sommeil != null && e.sommeil >= 7).length;
  const poidsDepart = settings?.poidsDepart ?? null;
  const poidsObj = settings?.objectifPoids ?? null;
  const dernierPoids = [...entries].reverse().find((e) => e.poids != null)?.poids ?? null;
  const versObjectif =
    poidsDepart != null && poidsObj != null && dernierPoids != null
      ? Math.max(0, Math.min(1, (poidsDepart - dernierPoids) / (poidsDepart - poidsObj || 1)))
      : 0;

  return [
    mk('streak-3', 'Régularité', '3 jours de journal d’affilée', 'flame', streak, 3),
    mk('streak-7', 'Semaine complète', '7 jours de journal d’affilée', 'calendar-check', streak, 7),
    mk('streak-30', 'Inarrêtable', '30 jours de journal d’affilée', 'trophy', streak, 30),
    mk('seance-1', 'Premier entraînement', '1 séance terminée', 'dumbbell', nbSeances, 1),
    mk('seance-10', 'Habitué de la salle', '10 séances terminées', 'dumbbell', nbSeances, 10),
    mk('seance-25', 'Machine de guerre', '25 séances terminées', 'medal', nbSeances, 25),
    mk('prot-5', 'Chasseur de protéines', '5 jours objectif protéines atteint', 'beef', joursProt, 5),
    mk('pas-7', 'Marcheur', '7 jours objectif de pas atteint', 'footprints', joursPas, 7),
    mk('sommeil-7', 'Bien reposé', '7 nuits de 7 h ou plus', 'bed-double', nuitsLongues, 7),
    mk('poids-50', 'En route', '50 % du chemin vers l’objectif poids', 'trending-down', Math.round(versObjectif * 100), 50),
    mk('poids-100', 'Objectif atteint', 'Poids objectif atteint', 'target', Math.round(versObjectif * 100), 100),
  ];
}
