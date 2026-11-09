// ------------------------------------------------------------------
// Rendez-vous ENTRE CLIENTS du même coach (SQLite) — partenaires de
// salle : un client publie un créneau (« je vais à la salle X à telle
// heure »), les autres clients le rejoignent. Aucun rôle pour le coach.
// ------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { AppError, ERR } from './errors.js';
import type { Db } from './db.js';
import type { RendezVous } from '@suivi/shared';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEURE_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface RdvInput {
  date: string;
  heure: string;
  lieu?: string | null;
  note?: string | null;
}

type RdvRow = {
  id: string;
  user_id: string;
  date: string;
  heure: string;
  lieu: string | null;
  note: string | null;
  created_at: string;
};

export class RendezVousStore {
  constructor(private db: Db) {}

  /** Tous les créneaux à venir, tous clients confondus (même salle). */
  listUpcoming(from: string, limit = 30): RendezVous[] {
    const rows = this.db
      .prepare(
        `SELECT id, user_id, date, heure, lieu, note, created_at
         FROM rendez_vous WHERE date >= ? ORDER BY date, heure LIMIT ?`,
      )
      .all(from, limit) as RdvRow[];
    return rows.map((r) => this.hydrate(r));
  }

  get(id: string): RendezVous | null {
    const r = this.db
      .prepare('SELECT id, user_id, date, heure, lieu, note, created_at FROM rendez_vous WHERE id = ?')
      .get(id) as RdvRow | undefined;
    return r ? this.hydrate(r) : null;
  }

  private hydrate(r: RdvRow): RendezVous {
    const participants = this.db
      .prepare('SELECT user_id FROM rendez_vous_participants WHERE rdv_id = ? ORDER BY created_at')
      .all(r.id) as { user_id: string }[];
    return {
      id: r.id,
      userId: r.user_id,
      createur: null, // enrichi dans la route (nom affiché / email)
      date: r.date,
      heure: r.heure,
      lieu: r.lieu,
      note: r.note,
      participants: participants.map((p) => ({ userId: p.user_id, nom: null })),
      createdAt: r.created_at,
    };
  }

  create(userId: string, input: RdvInput, today?: string): RendezVous {
    if (!DATE_RE.test(input.date)) throw new AppError(400, ERR.VALIDATION, 'Date invalide (YYYY-MM-DD)');
    if (!HEURE_RE.test(input.heure)) throw new AppError(400, ERR.VALIDATION, 'Heure invalide (HH:MM)');
    if (today && input.date < today) throw new AppError(400, ERR.VALIDATION, 'Impossible de publier une dispo passée');
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO rendez_vous (id, user_id, date, heure, lieu, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, userId, input.date, input.heure, input.lieu ?? null, input.note ?? null, new Date().toISOString());
    // Le créateur est d'office participant.
    this.join(id, userId);
    return this.get(id)!;
  }

  join(rdvId: string, userId: string): void {
    if (!this.get(rdvId)) throw new AppError(404, ERR.NOT_FOUND, 'Créneau introuvable');
    this.db
      .prepare('INSERT OR IGNORE INTO rendez_vous_participants (rdv_id, user_id, created_at) VALUES (?, ?, ?)')
      .run(rdvId, userId, new Date().toISOString());
  }

  /** Quitter un créneau — impossible pour le créateur (il doit supprimer). */
  leave(rdvId: string, userId: string): void {
    const rdv = this.get(rdvId);
    if (!rdv) throw new AppError(404, ERR.NOT_FOUND, 'Créneau introuvable');
    if (rdv.userId === userId) {
      throw new AppError(400, ERR.VALIDATION, 'Le créateur ne peut pas quitter — supprime le créneau');
    }
    this.db.prepare('DELETE FROM rendez_vous_participants WHERE rdv_id = ? AND user_id = ?').run(rdvId, userId);
  }

  /** Suppression — réservée au créateur du créneau. */
  remove(rdvId: string, userId: string): void {
    const rdv = this.get(rdvId);
    if (!rdv || rdv.userId !== userId) throw new AppError(404, ERR.NOT_FOUND, 'Créneau introuvable');
    this.db.prepare('DELETE FROM rendez_vous WHERE id = ?').run(rdvId);
  }
}
