import type { JournalValues } from './types.js';

// ------------------------------------------------------------------
// Correspondance colonnes <-> champs du journal.
// L'onglet « Suivi » a la structure suivante (cf. docs/ANALYSE.md) :
//   A Date | B N°Semaine | C Sommeil | D Forme | E Poids | F Calories
//   G Glucides | H Protéines | I Lipides | J Pas | K Entraînement
// ------------------------------------------------------------------

export const SHEET_SUIVI = 'Suivi';
export const SHEET_LISTE = 'Liste';
export const SHEET_FULL_BODY = 'Full body';
export const SHEET_BILAN = 'Bilan';

// Nouveaux onglets proposés (créés uniquement via l'étape de provisionnement
// explicite — jamais automatiquement).
export const SHEET_PROGRAMMES = 'Programmes';
export const SHEET_PROGRAMME_EXERCICES = 'ProgrammeExercices';
export const SHEET_SEANCES = 'Seances';
export const SHEET_SEANCE_SERIES = 'SeanceSeries';
export const SHEET_PARAMETRES = 'Parametres';

/** Onglets requis pour l'écriture applicative (hors Suivi/Liste existants). */
export const REQUIRED_NEW_TABS = [
  SHEET_PROGRAMMES,
  SHEET_PROGRAMME_EXERCICES,
  SHEET_SEANCES,
  SHEET_SEANCE_SERIES,
  SHEET_PARAMETRES,
] as const;

/**
 * Ordre des champs modifiables dans le journal.
 * Correspond exactement aux colonnes C..K — l'index 0 = colonne C.
 */
export const JOURNAL_FIELDS = [
  'sommeil',
  'forme',
  'poids',
  'calories',
  'glucides',
  'proteines',
  'lipides',
  'pas',
  'entrainement',
] as const satisfies readonly (keyof JournalValues)[];

export type JournalField = (typeof JOURNAL_FIELDS)[number];

/** Colonnes autorisées en écriture depuis le module Journal : C..K. */
export const JOURNAL_WRITABLE_FIRST_COL = 3; // C
export const JOURNAL_WRITABLE_LAST_COL = 11; // K
export const JOURNAL_HEADER_ROW = 1;
export const JOURNAL_FIRST_DATA_ROW = 2;

/** Placeholder utilisé dans le fichier d'origine pour « pas de donnée ». */
export const EMPTY_PLACEHOLDER = '-';

export const DEFAULT_TIMEZONE = 'Europe/Paris';

export const DEFAULT_SETTINGS = {
  objectifPoids: null,
  objectifCalories: null,
  objectifProteines: null,
  objectifGlucides: null,
  objectifLipides: null,
  objectifPas: null,
  poidsDepart: null,
  reposDefautSec: 90,
  unite: 'kg',
  timezone: DEFAULT_TIMEZONE,
} as const;

/** Noms des onglets autorisés en écriture par l'API (whitelist stricte). */
export const WRITABLE_SHEETS = [
  SHEET_SUIVI, // uniquement via le repository journal — plage restreinte
  SHEET_PROGRAMMES,
  SHEET_PROGRAMME_EXERCICES,
  SHEET_SEANCES,
  SHEET_SEANCE_SERIES,
  SHEET_PARAMETRES,
] as const;
