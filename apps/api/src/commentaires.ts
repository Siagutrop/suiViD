// ------------------------------------------------------------------
// Fil de commentaires par journée (SQLite) — boucle client ↔ coach :
// le client laisse un ressenti, le coach répond sur la même journée.
// ------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { AppError, ERR } from './errors.js';
import type { Db } from './db.js';
import type { Commentaire } from '@suivi/shared';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class CommentaireStore {
  constructor(private db: Db) {}

  /** Fil d'une journée, tri chronologique. */
  list(userId: string, date: string): Commentaire[] {
    if (!DATE_RE.test(date)) throw new AppError(400, ERR.VALIDATION, 'Date invalide (YYYY-MM-DD)');
    return this.db
      .prepare(
        `SELECT id, date, auteur, texte, created_at AS createdAt
         FROM journal_commentaires
         WHERE user_id = ? AND date = ?
         ORDER BY created_at, id`,
      )
      .all(userId, date) as Commentaire[];
  }

  /** Dates ayant au moins un commentaire (badge sur l'historique). */
  datesAvecCommentaires(userId: string, from: string, to: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT date FROM journal_commentaires
         WHERE user_id = ? AND date BETWEEN ? AND ?`,
      )
      .all(userId, from, to) as { date: string }[];
    return rows.map((r) => r.date);
  }

  add(userId: string, date: string, auteur: 'client' | 'coach', texte: string): Commentaire {
    if (!DATE_RE.test(date)) throw new AppError(400, ERR.VALIDATION, 'Date invalide (YYYY-MM-DD)');
    const c: Commentaire = {
      id: `cm_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      date,
      auteur,
      texte,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO journal_commentaires (id, user_id, date, auteur, texte, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(c.id, userId, date, auteur, texte, c.createdAt);
    return c;
  }

  /**
   * Supprime un commentaire. `auteur` restreint la suppression aux
   * messages de son propre rôle côté client ; le coach passe null et
   * peut tout retirer.
   */
  remove(userId: string, id: string, auteur: 'client' | 'coach' | null): void {
    const r = auteur
      ? this.db
          .prepare('DELETE FROM journal_commentaires WHERE id = ? AND user_id = ? AND auteur = ?')
          .run(id, userId, auteur)
      : this.db.prepare('DELETE FROM journal_commentaires WHERE id = ? AND user_id = ?').run(id, userId);
    if (!r.changes) throw new AppError(404, ERR.NOT_FOUND, 'Commentaire introuvable');
  }
}
