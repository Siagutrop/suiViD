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
  // ----- Paramétrable par le coach -----
  nomAffiche: string | null; // prénom/nom affiché au client
  tailleCm: number | null; // cm — morphologie du client
  dateNaissance: string | null; // YYYY-MM-DD
  noteCoach: string | null; // consignes/message affiché sur l'accueil
  joursSeance: number[]; // indices 0-6 (0 = dimanche) — planning hebdo
}

/** Champ de suivi personnalisé défini par le coach (ex. « Tour de taille »). */
export interface ChampCustom {
  id: string;
  nom: string;
  unite: string; // cm, L, /10, … — affichage seul
  ordre: number;
}

/** Valeur saisie pour un champ personnalisé à une date. */
export interface ChampValeur {
  champId: string;
  nom: string;
  unite: string;
  valeur: string | null;
}

export interface ApiMeta {
  mode: 'mock' | 'sheets' | 'sqlite';
  version: string;
  spreadsheetId: string | null;
  tabs: Record<string, boolean>; // présence des onglets attendus
}

/** Compte utilisateur tel qu'exposé par GET /api/me. */
export interface ApiMe {
  id: string;
  email: string;
  role: 'user' | 'coach';
  mode: 'mock' | 'sheets' | 'sqlite';
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

/** Aliment de la bibliothèque (macros pour 100 g). */
export interface Aliment {
  id: string;
  nom: string;
  kcal: number;
  proteines: number;
  glucides: number;
  lipides: number;
  codeBarre?: string | null;
  source?: 'perso' | 'off' | 'import';
  /** Famille d'équivalence renseignée par le coach (« Féculents », « Protéines »…). */
  groupe?: string | null;
}

/** Résultat de recherche externe (Open Food Facts) — non encore en bibliothèque. */
export interface AlimentExterne {
  source: 'off';
  codeBarre: string | null;
  nom: string;
  marque: string | null;
  kcal: number;
  proteines: number;
  glucides: number;
  lipides: number;
  image: string | null;
  /** true si les 3 macros sont renseignés dans la base. */
  complet: boolean;
}

/** Ligne d'aliment consommé dans un journal. */
export interface JournalAliment {
  id: string;
  alimentId: string;
  nom: string;
  quantiteG: number;
  kcal: number;
  proteines: number;
  glucides: number;
  lipides: number;
}

/** Photo de progression (fichier sur le serveur, métadonnées ici). */
export interface Photo {
  id: string;
  angle: string; // 'face' | 'profil' | 'profil-droit' | 'profil-gauche' | 'dos'
  pose?: 'relache' | 'contracte'; // absent sur les anciennes photos
  date: string; // ISO YYYY-MM-DD
  ext: 'jpg' | 'png' | 'webp';
  createdAt: string;
}

/** Message du fil de commentaires d'une journée (client ↔ coach). */
export interface Commentaire {
  id: string;
  date: string;
  auteur: 'client' | 'coach';
  texte: string;
  createdAt: string;
}

/** Alerte de suivi affichée sur le tableau de bord coach. */
export interface Alerte {
  type: 'silence' | 'pesee' | 'seances' | 'photos';
  message: string;
}

/** Ligne du tableau de bord coach — agrégats par client. */
export interface DashboardClient {
  id: string;
  email: string;
  disabled: boolean;
  createdAt: string;
  dernierJournal: string | null;
  journalSemaine: number; // entrées remplies sur 7 j
  seancesSemaine: number; // séances faites cette semaine (lun→auj.)
  seancesPrevues: number; // séances planifiées passées cette semaine
  dernierSeance: string | null;
  poids: number | null;
  poidsDelta7: number | null; // kg vs dernière pesée ≥ 5 j
  dernierePhoto: string | null;
  nbPhotos: number;
  alertes: Alerte[];
}
