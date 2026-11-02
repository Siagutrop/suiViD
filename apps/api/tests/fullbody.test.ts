import { describe, it, expect } from 'vitest';
import { MockProvider } from '../src/providers/MockProvider.js';
import { buildMockGrid, FIXTURE } from '../src/mock/seed.js';
import { reportSessionToFullBody } from '../src/repositories/FullBodyReporter.js';
import type { Session } from '@suivi/shared';

function makeSession(exercices: Session['exercices']): Session {
  return {
    id: 's1',
    date: '2026-11-02',
    programmeId: 'prog_fullbody',
    programmeNom: 'Full body',
    debut: '2026-11-02T18:00:00+01:00',
    fin: '2026-11-02T19:00:00+01:00',
    dureeSec: 3600,
    statut: 'terminee',
    notes: null,
    exercices,
  };
}

const firstExo = () => FIXTURE.fullBodyProgram[0]!.exercice;

describe('FullBodyReporter — report coach dans l’onglet Full body', () => {
  it('remplit le premier bloc libre : titre daté + charge/reps', async () => {
    const p = new MockProvider(buildMockGrid('2026-11-02'));
    const exo = firstExo();
    const s = makeSession([
      {
        exercice: exo,
        ordre: 1,
        passee: false,
        sets: [
          { serie: 1, chargeKg: 60, repetitions: 10, terminee: true, notes: null },
          { serie: 2, chargeKg: 60, repetitions: 8, terminee: true, notes: null },
          { serie: 3, chargeKg: null, repetitions: null, terminee: false, notes: null },
        ],
      },
    ]);
    const report = await reportSessionToFullBody(p, s);
    expect(report).not.toBeNull();
    expect(report!.appendedBlock).toBe(false);
    expect(report!.skippedExercises).toEqual([]);

    const title = await p.getRange('Full body', 'A1');
    expect(title[0]![0]).toBe('Full body — 02/11/2026');
    // Ligne de l'exercice 1 (bloc 1, ligne 4) : E..J = 60,10,60,8,-,-
    const row = await p.getRange('Full body', 'E4:J4');
    expect(row[0]).toEqual([60, 10, 60, 8, '-', '-']);
  });

  it('ignore les exercices absents du modèle', async () => {
    const p = new MockProvider(buildMockGrid('2026-11-02'));
    const report = await reportSessionToFullBody(
      p,
      makeSession([
        {
          exercice: 'Exercice inventé XYZ',
          ordre: 1,
          passee: false,
          sets: [{ serie: 1, chargeKg: 50, repetitions: 10, terminee: true, notes: null }],
        },
      ]),
    );
    expect(report!.skippedExercises).toEqual(['Exercice inventé XYZ']);
  });

  it('n’écrase jamais un bloc déjà rempli — prend le bloc libre suivant', async () => {
    const p = new MockProvider(buildMockGrid('2026-11-02'));
    const exo = firstExo();
    // Remplit le bloc 1 manuellement
    await p.writeProvision!('Full body', 'A1', [['Full body — 01/11/2026']]);
    await p.writeProvision!('Full body', 'E4:J4', [[60, 10, 60, 10, 60, 10]]);

    const s = makeSession([
      {
        exercice: exo,
        ordre: 1,
        passee: false,
        sets: [{ serie: 1, chargeKg: 65, repetitions: 9, terminee: true, notes: null }],
      },
    ]);
    const report = await reportSessionToFullBody(p, s);
    // Le bloc 1 était rempli → report dans le bloc 2 (titre ligne 16)
    expect(report!.blockTitleRow).toBe(16);
    // Le bloc 1 est intact
    const row1 = await p.getRange('Full body', 'E4:J4');
    expect(row1[0]).toEqual([60, 10, 60, 10, 60, 10]);
    // Le bloc 2 a reçu la nouvelle séance (même exo = ligne 19)
    const row2 = await p.getRange('Full body', 'E19:J19');
    expect(row2![0]).toEqual([65, 9, '-', '-', '-', '-']);
  });

  it('duplique un bloc quand tous sont remplis', async () => {
    const p = new MockProvider(buildMockGrid('2026-11-02'));
    const exo = firstExo();
    // Remplit les 2 blocs existants
    await p.writeProvision!('Full body', 'E4:F4', [[60, 10]]);
    await p.writeProvision!('Full body', 'E19:F19', [[60, 10]]);

    const s = makeSession([
      {
        exercice: exo,
        ordre: 1,
        passee: false,
        sets: [{ serie: 1, chargeKg: 70, repetitions: 8, terminee: true, notes: null }],
      },
    ]);
    const report = await reportSessionToFullBody(p, s);
    expect(report!.appendedBlock).toBe(true);
    // Le nouveau bloc est écrit après la fin de la grille (+ ligne vide)
    const title = await p.getRange('Full body', `A${report!.blockTitleRow}`);
    expect(title[0]![0]).toBe('Full body — 02/11/2026');
    // Ses lignes d'exos portent les mêmes noms que le modèle
    const exoCell = await p.getRange('Full body', `B${report!.blockTitleRow + 3}`);
    expect(exoCell[0]![0]).toBe(exo);
    // Et les X placeholders sont en place pour les autres exos
    const otherCell = await p.getRange('Full body', `E${report!.blockTitleRow + 4}`);
    expect(otherCell[0]![0]).toBe('X');
  });
});
