// ------------------------------------------------------------------
// Bibliothèque d'aliments + aliments consommés au journal (SQLite).
// La bibliothèque est globale et gérée par le coach ; les lignes
// journal_aliments appartiennent à chaque utilisateur.
// Elle s'enrichit aussi via la recherche Open Food Facts : un produit
// ajouté au journal est enregistré ici pour réutilisation par tous.
// ------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { AppError, ERR } from './errors.js';
import type { Db } from './db.js';
import type { Aliment, JournalAliment } from '@suivi/shared';

interface AlimentRow {
  id: string;
  nom: string;
  kcal: number;
  proteines: number;
  glucides: number;
  lipides: number;
  code_barre: string | null;
  source: 'perso' | 'off' | 'import';
  groupe: string | null;
}

interface JournalRow extends AlimentRow {
  ligne_id: string;
  quantite_g: number;
}

function toAliment(r: AlimentRow): Aliment {
  return {
    id: r.id,
    nom: r.nom,
    kcal: r.kcal,
    proteines: r.proteines,
    glucides: r.glucides,
    lipides: r.lipides,
    codeBarre: r.code_barre,
    source: r.source,
    groupe: r.groupe,
  };
}

export class AlimentStore {
  constructor(private db: Db) {}

  list(): Aliment[] {
    return (this.db.prepare('SELECT * FROM aliments ORDER BY nom COLLATE NOCASE').all() as AlimentRow[]).map(toAliment);
  }

  /** Recherche locale insensible à la casse (LIKE %q%). */
  search(q: string, limit = 10): Aliment[] {
    const rows = this.db
      .prepare('SELECT * FROM aliments WHERE nom LIKE ? COLLATE NOCASE ORDER BY nom COLLATE NOCASE LIMIT ?')
      .all(`%${q}%`, limit) as AlimentRow[];
    return rows.map(toAliment);
  }

  create(input: Omit<Aliment, 'id'>): Aliment {
    const a: Aliment = {
      id: `al_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      codeBarre: null,
      source: 'perso',
      groupe: null,
      ...input,
    };
    this.db
      .prepare(
        'INSERT INTO aliments (id, nom, kcal, proteines, glucides, lipides, code_barre, source, groupe) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        a.id,
        a.nom,
        a.kcal,
        a.proteines,
        a.glucides,
        a.lipides,
        a.codeBarre ?? null,
        a.source ?? 'perso',
        a.groupe ?? null,
      );
    return a;
  }

  /** Retourne l'aliment existant (même code-barres ou même nom) sinon le crée. */
  findOrCreate(input: Omit<Aliment, 'id'>): { aliment: Aliment; created: boolean } {
    if (input.codeBarre) {
      const byCode = this.db
        .prepare('SELECT * FROM aliments WHERE code_barre = ?')
        .get(input.codeBarre) as AlimentRow | undefined;
      if (byCode) return { aliment: toAliment(byCode), created: false };
    }
    const byNom = this.db
      .prepare('SELECT * FROM aliments WHERE nom = ? COLLATE NOCASE')
      .get(input.nom) as AlimentRow | undefined;
    if (byNom) return { aliment: toAliment(byNom), created: false };
    return { aliment: this.create(input), created: true };
  }

  update(id: string, input: Omit<Aliment, 'id'>): Aliment {
    const r = this.db
      .prepare(
        'UPDATE aliments SET nom = ?, kcal = ?, proteines = ?, glucides = ?, lipides = ?, code_barre = ?, groupe = ? WHERE id = ?',
      )
      .run(
        input.nom,
        input.kcal,
        input.proteines,
        input.glucides,
        input.lipides,
        input.codeBarre ?? null,
        input.groupe ?? null,
        id,
      );
    if (!r.changes) throw new AppError(404, ERR.NOT_FOUND, 'Aliment introuvable');
    return { id, source: 'perso', ...input };
  }

  remove(id: string): void {
    const r = this.db.prepare('DELETE FROM aliments WHERE id = ?').run(id);
    if (!r.changes) throw new AppError(404, ERR.NOT_FOUND, 'Aliment introuvable');
  }

  /**
   * Import CSV — une ligne par aliment, séparateur `;` `,` ou tab :
   *   nom ; kcal ; proteines ; glucides ; lipides [; groupe]
   * La 1re ligne est ignorée si ses valeurs ne sont pas numériques
   * (en-tête). Les doublons de nom sont sautés. Retourne les compteurs.
   */
  importCsv(csv: string): { ajoutes: number; ignores: number } {
    const lignes = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let ajoutes = 0;
    let ignores = 0;
    const insert = this.db.prepare(
      'INSERT INTO aliments (id, nom, kcal, proteines, glucides, lipides, code_barre, source, groupe) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)',
    );
    const findNom = this.db.prepare('SELECT 1 FROM aliments WHERE nom = ? COLLATE NOCASE');
    const tx = this.db.transaction(() => {
      for (const ligne of lignes) {
        const cols = ligne.split(/[;,\t]/).map((c) => c.trim());
        if (cols.length < 2) {
          ignores++;
          continue;
        }
        const [nom, kcal, p, g, l, groupe] = cols;
        const nk = Number(String(kcal).replace(',', '.'));
        if (!nom || !(nk >= 0)) {
          ignores++; // en-tête ou ligne invalide
          continue;
        }
        if (findNom.get(nom)) {
          ignores++;
          continue;
        }
        insert.run(
          `al_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
          nom,
          Math.round(nk * 10) / 10,
          Math.max(0, Number(String(p ?? '0').replace(',', '.')) || 0),
          Math.max(0, Number(String(g ?? '0').replace(',', '.')) || 0),
          Math.max(0, Number(String(l ?? '0').replace(',', '.')) || 0),
          'import',
          groupe?.trim() || null,
        );
        ajoutes++;
      }
    });
    tx();
    return { ajoutes, ignores };
  }

  /** Lignes d'un journal (aliment × quantité, macros calculées). */
  listJournal(userId: string, date: string): JournalAliment[] {
    const rows = this.db
      .prepare(
        `SELECT j.id AS ligne_id, a.*, j.quantite_g
         FROM journal_aliments j JOIN aliments a ON a.id = j.aliment_id
         WHERE j.user_id = ? AND j.date = ? ORDER BY j.created_at`,
      )
      .all(userId, date) as JournalRow[];
    return rows.map((r) => ({
      id: r.ligne_id,
      alimentId: r.id,
      nom: r.nom,
      quantiteG: r.quantite_g,
      kcal: Math.round((r.kcal * r.quantite_g) / 100),
      proteines: Math.round((r.proteines * r.quantite_g) / 10) / 10,
      glucides: Math.round((r.glucides * r.quantite_g) / 10) / 10,
      lipides: Math.round((r.lipides * r.quantite_g) / 10) / 10,
    }));
  }

  addToJournal(userId: string, date: string, alimentId: string, quantiteG: number): JournalAliment {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new AppError(400, ERR.VALIDATION, 'Date invalide (YYYY-MM-DD)');
    }
    const a = this.db.prepare('SELECT 1 FROM aliments WHERE id = ?').get(alimentId);
    if (!a) throw new AppError(404, ERR.NOT_FOUND, 'Aliment introuvable');
    if (!(quantiteG > 0) || quantiteG > 5000) {
      throw new AppError(400, ERR.VALIDATION, 'Quantité invalide (0–5000 g)');
    }
    const id = `ja_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    this.db
      .prepare(
        'INSERT INTO journal_aliments (id, user_id, date, aliment_id, quantite_g, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, userId, date, alimentId, quantiteG, new Date().toISOString());
    return this.listJournal(userId, date).find((l) => l.id === id)!;
  }

  /** Modifie la quantité d'une ligne de journal existante. */
  updateJournalQty(userId: string, ligneId: string, quantiteG: number): JournalAliment {
    if (!(quantiteG > 0) || quantiteG > 5000) {
      throw new AppError(400, ERR.VALIDATION, 'Quantité invalide (0–5000 g)');
    }
    const row = this.db
      .prepare('SELECT date FROM journal_aliments WHERE id = ? AND user_id = ?')
      .get(ligneId, userId) as { date: string } | undefined;
    if (!row) throw new AppError(404, ERR.NOT_FOUND, 'Ligne introuvable');
    this.db.prepare('UPDATE journal_aliments SET quantite_g = ? WHERE id = ?').run(quantiteG, ligneId);
    return this.listJournal(userId, row.date).find((l) => l.id === ligneId)!;
  }

  removeFromJournal(userId: string, ligneId: string): void {
    const r = this.db
      .prepare('DELETE FROM journal_aliments WHERE id = ? AND user_id = ?')
      .run(ligneId, userId);
    if (!r.changes) throw new AppError(404, ERR.NOT_FOUND, 'Ligne introuvable');
  }
}
