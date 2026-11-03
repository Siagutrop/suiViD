// ------------------------------------------------------------------
// Champs de suivi personnalisés (SQLite) — le coach définit des
// mesures par client (tour de taille, eau, humeur…), le client les
// remplit dans son journal. Le coach peut aussi saisir les valeurs.
// ------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { AppError, ERR } from './errors.js';
import type { Db } from './db.js';
import type { ChampCustom, ChampValeur } from '@suivi/shared';

export class ChampStore {
  constructor(private db: Db) {}

  /** Définitions des champs d'un client, triées par ordre. */
  list(userId: string): ChampCustom[] {
    return this.db
      .prepare('SELECT id, nom, unite, ordre FROM champs_custom WHERE user_id = ? ORDER BY ordre, nom')
      .all(userId) as ChampCustom[];
  }

  create(userId: string, input: { nom: string; unite: string }): ChampCustom {
    const max = this.db
      .prepare('SELECT COALESCE(MAX(ordre), 0) + 1 AS next FROM champs_custom WHERE user_id = ?')
      .get(userId) as { next: number };
    const c: ChampCustom = {
      id: `ch_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      nom: input.nom,
      unite: input.unite,
      ordre: max.next,
    };
    this.db
      .prepare('INSERT INTO champs_custom (id, user_id, nom, unite, ordre) VALUES (?, ?, ?, ?, ?)')
      .run(c.id, userId, c.nom, c.unite, c.ordre);
    return c;
  }

  update(userId: string, id: string, input: { nom: string; unite: string }): ChampCustom {
    const r = this.db
      .prepare('UPDATE champs_custom SET nom = ?, unite = ? WHERE id = ? AND user_id = ?')
      .run(input.nom, input.unite, id, userId);
    if (!r.changes) throw new AppError(404, ERR.NOT_FOUND, 'Champ introuvable');
    return { id, nom: input.nom, unite: input.unite, ordre: 0 };
  }

  remove(userId: string, id: string): void {
    const r = this.db
      .prepare('DELETE FROM champs_custom WHERE id = ? AND user_id = ?')
      .run(id, userId);
    if (!r.changes) throw new AppError(404, ERR.NOT_FOUND, 'Champ introuvable');
  }

  /** Valeurs d'un journal : définitions + valeur saisie (null si vide). */
  getValues(userId: string, date: string): ChampValeur[] {
    const rows = this.db
      .prepare(
        `SELECT c.id AS champId, c.nom, c.unite, j.valeur
         FROM champs_custom c
         LEFT JOIN journal_custom j
           ON j.champ_id = c.id AND j.user_id = c.user_id AND j.date = ?
         WHERE c.user_id = ? ORDER BY c.ordre, c.nom`,
      )
      .all(date, userId) as ChampValeur[];
    return rows;
  }

  /** Valeurs sur une plage de dates (pour l'affichage historique). */
  getValuesRange(userId: string, from: string, to: string): { date: string; champId: string; valeur: string }[] {
    return this.db
      .prepare(
        `SELECT date, champ_id AS champId, valeur
         FROM journal_custom
         WHERE user_id = ? AND date BETWEEN ? AND ? AND valeur IS NOT NULL`,
      )
      .all(userId, from, to) as { date: string; champId: string; valeur: string }[];
  }

  /** Upsert d'une valeur — null/'' efface la ligne. */
  setValue(userId: string, date: string, champId: string, valeur: string | null): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new AppError(400, ERR.VALIDATION, 'Date invalide (YYYY-MM-DD)');
    }
    const champ = this.db
      .prepare('SELECT 1 FROM champs_custom WHERE id = ? AND user_id = ?')
      .get(champId, userId);
    if (!champ) throw new AppError(404, ERR.NOT_FOUND, 'Champ introuvable');

    if (valeur === null || valeur === '') {
      this.db
        .prepare('DELETE FROM journal_custom WHERE user_id = ? AND date = ? AND champ_id = ?')
        .run(userId, date, champId);
      return;
    }
    this.db
      .prepare(
        `INSERT INTO journal_custom (id, user_id, date, champ_id, valeur, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, date, champ_id) DO UPDATE SET valeur = excluded.valeur`,
      )
      .run(`jc_${randomUUID().replace(/-/g, '').slice(0, 12)}`, userId, date, champId, valeur, new Date().toISOString());
  }
}
