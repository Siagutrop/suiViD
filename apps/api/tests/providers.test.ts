import { describe, expect, it } from 'vitest';
import {
  SHEET_BILAN,
  SHEET_FULL_BODY,
  SHEET_LISTE,
  SHEET_SEANCES,
  SHEET_SUIVI,
} from '@suivi/shared';
import { MockProvider } from '../src/providers/MockProvider.js';
import { buildMockGrid } from '../src/mock/seed.js';
import { ExerciseRepository } from '../src/repositories/ExerciseRepository.js';
import { SessionRepository } from '../src/repositories/SessionRepository.js';
import { ProgramRepository } from '../src/repositories/ProgramRepository.js';
import { SettingsRepository } from '../src/repositories/SettingsRepository.js';

const TZ = 'Europe/Paris';

function makeProvider() {
  return new MockProvider(buildMockGrid('2026-11-02'));
}

describe('MockProvider — sémantique Google Sheets', () => {
  it('getRange borne, cellules vides = null', async () => {
    const p = makeProvider();
    const rows = await p.getRange(SHEET_LISTE, 'A2:C4');
    expect(rows).toHaveLength(3);
    expect(rows[0]![0]).toBe('Crunch poulie haute');
  });

  it('updateRange écrit des cellules précises sans toucher le reste', async () => {
    const p = makeProvider();
    await p.updateRange(SHEET_SUIVI, 'C3', [[7.5]]);
    const row = (await p.getRange(SHEET_SUIVI, 'A3:K3'))[0]!;
    expect(row[2]).toBe(7.5);
    expect(row[0]).not.toBeNull(); // date conservée
  });

  it('appendRows ajoute après la dernière ligne', async () => {
    const p = makeProvider();
    const before = await p.getRange(SHEET_SEANCES, 'A1:A2000');
    const n = before.filter((r) => r[0] != null).length;
    await p.appendRows(SHEET_SEANCES, [['x1', '2026-11-02', 'p', 'Full body', 'd', 'f', 60, 'terminee', null]]);
    const after = await p.getRange(SHEET_SEANCES, `A${n + 1}:A${n + 1}`);
    expect(after[0]![0]).toBe('x1');
  });

  it('REFUSE toute écriture sur les onglets protégés (Liste, Full body, Bilan)', async () => {
    const p = makeProvider();
    for (const tab of [SHEET_LISTE, SHEET_FULL_BODY, SHEET_BILAN]) {
      await expect(p.updateRange(tab, 'A1', [['x']])).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN_SHEET',
      });
      await expect(p.appendRows(tab, [['x']])).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN_SHEET',
      });
    }
  });
});

describe('Repositories sur le mode démo', () => {
  it('ExerciseRepository lit 92 exercices et normalise « Trices »', async () => {
    const exos = await new ExerciseRepository(makeProvider()).list();
    expect(exos).toHaveLength(92);
    expect(exos.filter((e) => e.muscle === 'Triceps').length).toBeGreaterThanOrEqual(7);
    expect(exos.every((e) => e.muscle !== 'Trices')).toBe(true);
  });

  it('SessionRepository assemble séances + séries et calcule last-perf', async () => {
    const repo = new SessionRepository(makeProvider(), TZ);
    const sessions = await repo.list();
    expect(sessions.length).toBe(3);
    expect(sessions[0]!.exercices.length).toBe(11);
    expect(sessions[0]!.exercices[0]!.sets.length).toBe(3);
    const perf = await repo.lastPerformanceByExercise();
    expect(perf.get('Développé Couché Smith Machine')?.length).toBe(3);
  });

  it('finir une séance append des lignes stables et la séance est relisible', async () => {
    const repo = new SessionRepository(makeProvider(), TZ);
    const s = await repo.finish({
      programmeId: 'prog_fullbody',
      programmeNom: 'Full body',
      debut: '2026-11-02T18:00:00+01:00',
      fin: '2026-11-02T19:00:00+01:00',
      statut: 'terminee',
      exercices: [
        {
          exercice: 'Développé Couché Smith Machine',
          ordre: 1,
          passee: false,
          sets: [
            { serie: 1, chargeKg: 60, repetitions: 10, terminee: true, notes: null },
            { serie: 2, chargeKg: 60, repetitions: 8, terminee: true, notes: null },
          ],
        },
      ],
    });
    expect(s.id).toMatch(/^s_/);
    expect(s.dureeSec).toBe(3600);
    const reread = await repo.get(s.id);
    expect(reread.exercices[0]!.sets).toHaveLength(2);
  });

  it('ProgramRepository liste le programme Full body importé (11 exos)', async () => {
    const repo = new ProgramRepository(makeProvider());
    const progs = await repo.list();
    expect(progs).toHaveLength(1);
    expect(progs[0]!.nom).toBe('Full body');
    expect(progs[0]!.exercices[0]!.exercice).toBe('Développé Couché Smith Machine');
    expect(progs[0]!.exercices[0]!.series).toBe(3);
  });

  it('ProgramRepository update réordonne sans perdre les autres programmes', async () => {
    const p = makeProvider();
    const repo = new ProgramRepository(p);
    const [prog] = await repo.list();
    const reordered = [...prog!.exercices].reverse();
    await repo.update(prog!.id, { exercices: reordered });
    const after = await repo.get(prog!.id);
    expect(after.exercices[0]!.exercice).toBe('Matrix - Mollet sur leg press horizontal');
    expect(after.exercices).toHaveLength(11);
  });

  it('SettingsRepository lit et met à jour les paramètres', async () => {
    const repo = new SettingsRepository(makeProvider());
    const s = await repo.get();
    expect(s.objectifCalories).toBe(2400);
    const updated = await repo.update({ ...s, objectifCalories: 2600 });
    expect(updated.objectifCalories).toBe(2600);
  });
});
