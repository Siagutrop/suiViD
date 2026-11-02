// ------------------------------------------------------------------
// Types métier partagés entre le frontend et le backend.
// ------------------------------------------------------------------

/** Champs modifiables du journal quotidien (colonnes C..K de l'onglet Suivi). */
export interface JournalValues {
  sommeil: number | null; // C — heures de sommeil (décimales autorisées)
  forme: number | null; //   D — forme du jour, 1 à 10
  poids: number | null; //   E — poids en kg
  calories: number | null; // F — total calories (kcal)
  glucides: number | null; // G — grammes
  proteines: number | null; // H — grammes
  lipides: number | null; //  I — grammes
  pas: number | null; //      J — nombre de pas
  entrainement: string | null; // K — texte libre / nom de séance
}

/** Une ligne complète du journal (avec les colonnes en lecture seule A et B). */
export interface JournalEntry extends JournalValues {
  date: string; // A — ISO YYYY-MM-DD
  week: number | null; // B — numéro de semaine
}

export interface Exercise {
  nom: string;
  muscle: string;
  videoUrl: string | null;
}

export interface ProgramExercise {
  exercice: string; // nom, jointure avec l'onglet Liste
  series: number;
  repsCible: string | null; // ex. "8-12" — texte libre
  variante: string | null; // colonne "Réglage" du fichier d'origine
  notes: string | null;
  /** Repos entre séries en secondes — null = reposDefautSec des paramètres. */
  reposSec: number | null;
}

export interface Program {
  id: string;
  nom: string;
  statut: 'actif' | 'archive';
  creeLe: string; // ISO
  note: string | null;
  exercices: ProgramExercise[];
}

export interface SessionSet {
  serie: number;
  chargeKg: number | null;
  repetitions: number | null;
  terminee: boolean;
  notes: string | null;
}

export interface SessionExercise {
  exercice: string;
  ordre: number;
  passee: boolean;
  sets: SessionSet[];
}

export interface Session {
  id: string;
  date: string; // ISO YYYY-MM-DD (jour calendaire Europe/Paris)
  programmeId: string | null;
  programmeNom: string;
  debut: string; // ISO datetime
  fin: string | null; // ISO datetime
  dureeSec: number | null;
  statut: 'terminee' | 'abandonnee';
  notes: string | null;
  exercices: SessionExercise[];
}

export interface UserSettings {
  objectifPoids: number | null; // kg
  objectifCalories: number | null; // kcal / jour
  objectifProteines: number | null; // g / jour
  objectifGlucides: number | null; // g / jour
  objectifLipides: number | null; // g / jour
  objectifPas: number | null; // pas / jour
  poidsDepart: number | null; // kg — point de départ de la progression
  reposDefautSec: number; // durée par défaut du minuteur de récupération
  unite: 'kg';
  timezone: string; // ex. Europe/Paris
}

export interface ApiMeta {
  mode: 'mock' | 'sheets';
  version: string;
  spreadsheetId: string | null;
  tabs: Record<string, boolean>; // présence des onglets attendus
}

/** Compte utilisateur tel qu'exposé par GET /api/me. */
export interface ApiMe {
  id: string;
  email: string;
  mode: 'mock' | 'sheets';
  /** true tant qu'aucun classeur n'est lié (setup de 1re connexion). */
  needsSetup: boolean;
  /** ID du classeur masqué, ex. « ••••••xK9f2A » — jamais complet. */
  spreadsheetId: string | null;
  /** Email du compte de service à inviter sur le classeur (mode sheets). */
  serviceAccountEmail: string | null;
}

/** Résultat de POST /api/me/spreadsheet. */
export interface LinkSheetResult {
  linked: boolean;
  created: string[]; // onglets créés
  seeded: string[]; // onglets remplis (données de départ)
  programImported: boolean;
  tabs: string[];
}

// ---------- Réponses d'API ----------

export interface TodayResponse {
  entry: JournalEntry;
  rowIndex: number | null; // index 1-based dans Google Sheets ; null si absente
  rowMissing: boolean; // true si aucune ligne ne correspond à la date du jour
}

export interface ConflictInfo {
  current: JournalValues;
  expected: JournalValues;
}

export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}
