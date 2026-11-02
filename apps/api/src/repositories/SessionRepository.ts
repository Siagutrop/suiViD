import { randomUUID } from 'node:crypto';
import {
  SHEET_SEANCES,
  SHEET_SEANCE_SERIES,
  toDateKey,
  type Session,
  type SessionExercise,
} from '@suivi/shared';
import { AppError, ERR } from '../errors.js';
import type { DataProvider } from '../providers/DataProvider.js';
import { toNumber, toText } from './cells.js';

// ------------------------------------------------------------------
// Onglets normalisés :
//   Seances       : id | date | programme_id | programme_nom | debut |
//                   fin | duree_sec | statut | notes
//   SeanceSeries  : seance_id | exercice | ordre_exercice | serie |
//                   charge_kg | repetitions | terminee | notes
// Append-only : les lignes ne sont jamais réécrites ni supprimées.
// ------------------------------------------------------------------

export class SessionRepository {
  constructor(
    private readonly provider: DataProvider,
    private readonly timezone: string,
  ) {}

  private async ensureTabs() {
    const tabs = await this.provider.listSheets();
    const missing = [SHEET_SEANCES, SHEET_SEANCE_SERIES].filter((t) => !tabs.includes(t));
    if (missing.length) {
      throw new AppError(
        409,
        ERR.TABS_MISSING,
        `Onglets manquants : ${missing.join(', ')}. ` +
          'Exécutez le provisionnement avant d’enregistrer des séances.',
      );
    }
  }

  async list(limit = 50): Promise<Session[]> {
    await this.ensureTabs();
    const [headers, sets] = await Promise.all([
      this.provider.getRange(SHEET_SEANCES, 'A2:I1000'),
      this.provider.getRange(SHEET_SEANCE_SERIES, 'A2:H5000'),
    ]);
    const setsBySession = new Map<string, SessionExercise[]>();
    for (const row of sets) {
      const sid = toText(row[0]);
      if (!sid) continue;
      const exoName = toText(row[1]) ?? '';
      const ordre = toNumber(row[2]) ?? 0;
      const set = {
        serie: toNumber(row[3]) ?? 0,
        chargeKg: toNumber(row[4]),
        repetitions: toNumber(row[5]),
        terminee: toText(row[6]) === 'true' || toText(row[6]) === '1',
        notes: toText(row[7]),
      };
      if (!setsBySession.has(sid)) setsBySession.set(sid, []);
      const list = setsBySession.get(sid)!;
      let ex = list.find((e) => e.exercice === exoName && e.ordre === ordre);
      if (!ex) {
        ex = { exercice: exoName, ordre, passee: false, sets: [] };
        list.push(ex);
      }
      ex.sets.push(set);
    }
    return headers
      .map((row) => {
        const id = toText(row[0]);
        if (!id) return null;
        const exercices = (setsBySession.get(id) ?? []).sort((a, b) => a.ordre - b.ordre);
        exercices.forEach((e) => e.sets.sort((a, b) => a.serie - b.serie));
        return {
          id,
          date: toText(row[1]) ?? '',
          programmeId: toText(row[2]),
          programmeNom: toText(row[3]) ?? '',
          debut: toText(row[4]) ?? '',
          fin: toText(row[5]),
          dureeSec: toNumber(row[6]),
          statut: (toText(row[7]) === 'abandonnee' ? 'abandonnee' : 'terminee') as Session['statut'],
          notes: toText(row[8]),
          exercices,
        } satisfies Session;
      })
      .filter((s): s is Session => s !== null)
      .sort((a, b) => b.debut.localeCompare(a.debut))
      .slice(0, limit);
  }

  async get(id: string): Promise<Session> {
    const s = (await this.list(1000)).find((x) => x.id === id);
    if (!s) throw new AppError(404, ERR.NOT_FOUND, `Séance introuvable : ${id}`);
    return s;
  }

  /** Dernière séance terminée (pour la carte « prochaine séance »). */
  async lastSession(): Promise<Session | null> {
    const list = await this.list(1);
    return list[0] ?? null;
  }

  /**
   * Enregistre une séance terminée — append 1 ligne Seances + N lignes
   * SeanceSeries avec identifiants stables. Jamais de réécriture.
   */
  async finish(input: {
    programmeId?: string | null;
    programmeNom: string;
    debut: string;
    fin: string;
    statut: 'terminee' | 'abandonnee';
    notes?: string | null;
    exercices: SessionExercise[];
  }): Promise<Session> {
    await this.ensureTabs();
    const id = `s_${randomUUID().slice(0, 12)}`;
    const debut = new Date(input.debut);
    const fin = new Date(input.fin);
    const dureeSec = Math.max(0, Math.round((fin.getTime() - debut.getTime()) / 1000));
    const date = toDateKey(debut, this.timezone);

    await this.provider.appendRows(SHEET_SEANCES, [
      [
        id,
        date,
        input.programmeId ?? null,
        input.programmeNom,
        input.debut,
        input.fin,
        dureeSec,
        input.statut,
        input.notes ?? null,
      ],
    ]);

    const rows = input.exercices.flatMap((ex) =>
      ex.sets.map((s) => [
        id,
        ex.exercice,
        ex.ordre,
        s.serie,
        s.chargeKg ?? null,
        s.repetitions ?? null,
        s.terminee ? 'true' : 'false',
        s.notes ?? null,
      ]),
    );
    if (rows.length) await this.provider.appendRows(SHEET_SEANCE_SERIES, rows);

    return this.get(id);
  }

  /** Dernière performance connue par exercice (charge/reps de la dernière série faite). */
  async lastPerformanceByExercise(): Promise<Map<string, { date: string; chargeKg: number | null; repetitions: number | null }[]>> {
    const sessions = await this.list(30);
    const map = new Map<string, { date: string; chargeKg: number | null; repetitions: number | null }[]>();
    for (const s of sessions) {
      for (const ex of s.exercices) {
        const done = ex.sets.filter((x) => x.terminee);
        if (!done.length) continue;
        if (!map.has(ex.exercice)) {
          map.set(
            ex.exercice,
            done.map((x) => ({ date: s.date, chargeKg: x.chargeKg, repetitions: x.repetitions })),
          );
        }
      }
    }
    return map;
  }
}
