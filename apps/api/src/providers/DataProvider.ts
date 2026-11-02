// ------------------------------------------------------------------
// Abstraction d'accès aux données tabulaires.
// Google Sheets reste la source de vérité ; le provider Mock reproduit
// fidèlement la sémantique (plages A1, cellules vides, append) pour le
// développement et les tests sans identifiants Google.
//
// Toutes les valeurs sont des scalaires de cellule : string | number |
// boolean | null (cellule vide).
// ------------------------------------------------------------------

export type CellValue = string | number | boolean | null;
export type Grid = CellValue[][];

export interface RangeUpdate {
  /** Plage A1 sans nom d'onglet, ex. "C5" ou "A2:G10". */
  range: string;
  values: CellValue[][];
}

export interface DataProvider {
  /** Lit les valeurs d'une plage. Retourne une matrice (lignes courtes possibles, '' pour vide). */
  getRange(sheet: string, a1: string): Promise<Grid>;

  /** Écrit une plage (valeurs déjà validées en amont). */
  updateRange(sheet: string, a1: string, values: CellValue[][]): Promise<void>;

  /** Écrit plusieurs plages en une seule requête (atomique au sens de l'API). */
  batchUpdate(sheet: string, updates: RangeUpdate[]): Promise<void>;

  /** Ajoute des lignes après la dernière ligne de données de l'onglet. */
  appendRows(sheet: string, values: CellValue[][]): Promise<void>;

  /** Liste des onglets existants. */
  listSheets(): Promise<string[]>;

  /**
   * Crée un onglet. Réservé au provisionnement explicite —
   * jamais appelé automatiquement lors d'une écriture métier.
   */
  createSheet(sheet: string): Promise<void>;

  /**
   * Écriture de provisionnement (en-têtes, données de départ) pouvant
   * cibler des onglets hors whitelist. Uniquement appelée par la logique
   * de provisionnement d'un classeur — jamais par les repositories.
   */
  writeProvision?(sheet: string, a1: string, values: CellValue[][]): Promise<void>;
}
