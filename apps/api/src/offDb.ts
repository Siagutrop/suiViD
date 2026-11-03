// ------------------------------------------------------------------
// Copie locale Open Food Facts — produits vendus en France importés
// dans SQLite (offSync.ts). Recherche FTS5 instantanée, classement
// par nombre de scans (popularité réelle en rayon).
// ------------------------------------------------------------------

import type { Db } from './db.js';
import type { AlimentExterne } from '@suivi/shared';
import { extractBrand, STOPWORDS } from './offShared.js';

export interface OffProductRow {
  code: string;
  nom: string;
  marque: string | null;
  kcal: number;
  proteines: number;
  glucides: number;
  lipides: number;
  scans: number;
}

export class OffDbStore {
  constructor(private db: Db) {}

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM off_products').get() as { n: number }).n;
  }

  meta(): { lastSync: string | null; count: number } {
    const r = this.db.prepare('SELECT last_sync, count FROM off_meta WHERE id = 1').get() as
      | { last_sync: string | null; count: number }
      | undefined;
    return { lastSync: r?.last_sync ?? null, count: r?.count ?? 0 };
  }

  private ins = () =>
    this.db.prepare(
      'INSERT INTO off_products_staging (code, nom, marque, kcal, proteines, glucides, lipides, scans) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );

  /**
   * Démarre un import dans la table de staging : le catalogue actif
   * (off_products + off_fts) n'est pas touché — un échec de
   * téléchargement laisse la copie précédente intacte.
   */
  beginImport(): void {
    this.db.exec('DELETE FROM off_products_staging');
  }

  /** Insertion par chunks pendant le stream (transaction par chunk). */
  insertChunk(rows: OffProductRow[]): void {
    const ins = this.ins();
    const tx = this.db.transaction(() => {
      for (const r of rows) {
        ins.run(r.code, r.nom, r.marque, r.kcal, r.proteines, r.glucides, r.lipides, r.scans);
      }
    });
    tx();
  }

  /**
   * Bascule atomique : staging → tables actives + rebuild FTS + meta.
   * Tout dans une transaction — soit tout passe, soit rien ne change.
   */
  commitImport(count: number): void {
    const tx = this.db.transaction(() => {
      this.db.exec('DELETE FROM off_fts');
      this.db.exec('DELETE FROM off_products');
      this.db.exec('INSERT INTO off_products SELECT * FROM off_products_staging');
      this.db.exec('INSERT INTO off_fts (nom, marque, code) SELECT nom, marque, code FROM off_products_staging');
      this.db.exec('DELETE FROM off_products_staging');
      this.db
        .prepare(
          'INSERT INTO off_meta (id, last_sync, count) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET last_sync = excluded.last_sync, count = excluded.count',
        )
        .run(new Date().toISOString(), count);
    });
    tx();
  }

  /** Remplace tout le catalogue en une fois (petits volumes / tests). */
  replaceAll(rows: OffProductRow[]): void {
    this.beginImport();
    this.insertChunk(rows);
    this.commitImport(rows.length);
  }

  /** Upsert unitaire — utilisé par les exports delta. */
  upsert(r: OffProductRow): void {
    this.db
      .prepare(
        `INSERT INTO off_products (code, nom, marque, kcal, proteines, glucides, lipides, scans)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(code) DO UPDATE SET nom=excluded.nom, marque=excluded.marque, kcal=excluded.kcal,
           proteines=excluded.proteines, glucides=excluded.glucides, lipides=excluded.lipides, scans=excluded.scans`,
      )
      .run(r.code, r.nom, r.marque, r.kcal, r.proteines, r.glucides, r.lipides, r.scans);
    this.db.prepare('DELETE FROM off_fts WHERE code = ?').run(r.code);
    this.db.prepare('INSERT INTO off_fts (nom, marque, code) VALUES (?, ?, ?)').run(r.nom, r.marque ?? '', r.code);
  }

  /** Supprime un produit (présent dans un delta comme deleted). */
  deleteCode(code: string): void {
    this.db.prepare('DELETE FROM off_products WHERE code = ?').run(code);
    this.db.prepare('DELETE FROM off_fts WHERE code = ?').run(code);
  }

  /** Lot de deltas (upserts + suppressions) en une transaction. */
  applyDeltaBatch(batch: { del?: string; row?: OffProductRow }[]): void {
    const tx = this.db.transaction(() => {
      for (const b of batch) {
        if (b.del) this.deleteCode(b.del);
        else if (b.row) this.upsert(b.row);
      }
    });
    tx();
  }

  /** Met à jour seulement l'horodatage (delta sans changement pertinent). */
  touchMeta(): void {
    const { count } = this.meta();
    this.db
      .prepare(
        'INSERT INTO off_meta (id, last_sync, count) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET last_sync = excluded.last_sync',
      )
      .run(new Date().toISOString(), count);
  }

  /** Recherche texte — tokens préfixes FTS5, classement par scans. */
  search(q: string, limit = 10): AlimentExterne[] {
    const { terms, brand } = extractBrand(q.toLowerCase());
    const nomTokens = terms
      .split(/[\s'’-]+/)
      .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
      .map((t) => `nom:${t}*`);
    const marqueTokens = brand ? [`marque:${brand}*`] : [];
    const match = [...nomTokens, ...marqueTokens].join(' ');
    if (!match) return [];
    const rows = this.db
      .prepare(
        `SELECT p.* FROM off_fts f JOIN off_products p ON p.code = f.code
         WHERE off_fts MATCH ? ORDER BY p.scans DESC LIMIT ?`,
      )
      .all(match, limit) as OffProductRow[];
    return rows.map(toExterne);
  }

  /** Lookup direct par code-barres. */
  barcode(code: string): AlimentExterne | null {
    const r = this.db.prepare('SELECT * FROM off_products WHERE code = ?').get(code) as
      | OffProductRow
      | undefined;
    return r ? toExterne(r) : null;
  }
}

function toExterne(r: OffProductRow): AlimentExterne {
  return {
    source: 'off',
    codeBarre: r.code,
    nom: r.nom,
    marque: r.marque,
    kcal: Math.round(r.kcal),
    proteines: Math.round(r.proteines * 10) / 10,
    glucides: Math.round(r.glucides * 10) / 10,
    lipides: Math.round(r.lipides * 10) / 10,
    image: null,
    complet: true, // filtré à l'import — les 3 macros sont là
  };
}
