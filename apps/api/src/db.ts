// ------------------------------------------------------------------
// Persistance SQLite — remplace Google Sheets comme source de vérité.
//
// Les repositories parlent en « grilles » (DataProvider) : on reproduit
// cette sémantique en SQL. Chaque « onglet » est virtuel — les cellules
// d'un utilisateur vivent dans `cells` avec un scope :
//   - scope = userId          → données privées (Suivi, Seances, …)
//   - scope = 'global'        → bibliothèque partagée (Liste d'exercices)
//
// Fichier unique dans le volume de données existant (data/suivid.db).
// ------------------------------------------------------------------

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Db = Database.Database;

/** Onglets dont le contenu est partagé par tous les utilisateurs. */
export const GLOBAL_SHEETS = new Set(['Liste']);

export function defaultDbFile(): string {
  const cwd = process.cwd();
  if (existsSync(resolve(cwd, '../../package.json'))) {
    return resolve(cwd, '../../data/suivid.db');
  }
  const viaCwd = resolve(cwd, 'data/suivid.db');
  if (existsSync(viaCwd) || existsSync(resolve(cwd, 'package.json'))) return viaCwd;
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return resolve(moduleDir, '../../../../data/suivid.db');
}

export function openDb(file: string): Db {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    -- Cellule d'un onglet virtuel. r/c = position A1 (1-based).
    -- t : 's' string | 'n' number | 'b' boolean. Une ligne nulle = cellule effacée.
    CREATE TABLE IF NOT EXISTS cells (
      scope TEXT NOT NULL,
      sheet TEXT NOT NULL,
      r     INTEGER NOT NULL,
      c     INTEGER NOT NULL,
      t     TEXT NOT NULL CHECK (t IN ('s','n','b')),
      v     TEXT,
      n     REAL,
      PRIMARY KEY (scope, sheet, r, c)
    ) WITHOUT ROWID;

    -- Onglets existants (même vides) par scope.
    CREATE TABLE IF NOT EXISTS sheets (
      scope TEXT NOT NULL,
      name  TEXT NOT NULL,
      PRIMARY KEY (scope, name)
    ) WITHOUT ROWID;

    -- Bibliothèque d'aliments (globale, gérée par le coach). Macros /100 g.
    CREATE TABLE IF NOT EXISTS aliments (
      id        TEXT PRIMARY KEY,
      nom       TEXT NOT NULL,
      kcal      REAL NOT NULL,
      proteines REAL NOT NULL,
      glucides  REAL NOT NULL,
      lipides   REAL NOT NULL
    );

    -- Aliments consommés dans un journal donné.
    CREATE TABLE IF NOT EXISTS journal_aliments (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      date       TEXT NOT NULL,
      aliment_id TEXT NOT NULL REFERENCES aliments(id) ON DELETE CASCADE,
      quantite_g REAL NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_journal_aliments ON journal_aliments(user_id, date);

    -- Champs de suivi personnalisés, définis par le coach par client
    -- (tour de taille, eau bue, humeur… tout ce qui n'existe pas en standard).
    CREATE TABLE IF NOT EXISTS champs_custom (
      id      TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      nom     TEXT NOT NULL,
      unite   TEXT NOT NULL DEFAULT '',
      ordre   INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_champs_custom ON champs_custom(user_id);

    -- Valeur d'un champ personnalisé pour une date donnée.
    CREATE TABLE IF NOT EXISTS journal_custom (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      date       TEXT NOT NULL,
      champ_id   TEXT NOT NULL REFERENCES champs_custom(id) ON DELETE CASCADE,
      valeur     TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (user_id, date, champ_id)
    );
    CREATE INDEX IF NOT EXISTS idx_journal_custom ON journal_custom(user_id, date);

    -- Fil de commentaires d'une journée (client ↔ coach).
    CREATE TABLE IF NOT EXISTS journal_commentaires (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      date       TEXT NOT NULL,
      auteur     TEXT NOT NULL CHECK (auteur IN ('client','coach')),
      texte      TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_journal_commentaires ON journal_commentaires(user_id, date);

  `);

  // Colonnes ajoutées après création initiale — l'ALTER échoue
  // silencieusement si la colonne existe déjà.
  for (const sql of [
    'ALTER TABLE aliments ADD COLUMN code_barre TEXT',
    "ALTER TABLE aliments ADD COLUMN source TEXT NOT NULL DEFAULT 'perso'",
    'ALTER TABLE aliments ADD COLUMN groupe TEXT',
  ]) {
    try {
      db.exec(sql);
    } catch {
      /* colonne déjà présente */
    }
  }
  return db;
}
