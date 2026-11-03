import { describe, expect, it } from 'vitest';
import {
  SHEET_BILAN,
  SHEET_FULL_BODY,
  SHEET_LISTE,
  SHEET_SEANCES,
  SHEET_SUIVI,
} from '@suivi/shared';
import { openDb } from '../src/db.js';
import { SqliteProvider } from '../src/providers/SqliteProvider.js';
import { buildMockGrid } from '../src/mock/seed.js';
import type { CellValue } from '../src/providers/DataProvider.js';
import { ExerciseRepository } from '../src/repositories/ExerciseRepository.js';
import { SessionRepository } from '../src/repositories/SessionRepository.js';
import { SettingsRepository } from '../src/repositories/SettingsRepository.js';
import { provisionSpreadsheet } from '../src/provision.js';

const TZ = 'Europe/Paris';

function makeDb() {
  return openDb(':memory:');
}

/** Charge une grille complète (format MockProvider) dans le scope d'un user. */
async function seed(p: SqliteProvider, grid: Record<string, CellValue[][]>) {
  for (const [sheet, rows] of Object.entries(grid)) {
    await p.createSheet(sheet);
    if (rows.length) await p.writeProvision!(sheet, 'A1', rows);
  }
}

function makeProvider(userId = 'u_test') {
  const db = makeDb();
  return { db, p: new SqliteProvider(db, userId) };
}

describe('SqliteProvider — sémantique identique à Sheets/Mock', () => {
  it('getRange borne, cellules vides = null', async () => {
    const { p } = makeProvider();
    await seed(p, buildMockGrid('2026-11-02'));
    const rows = await p.getRange(SHEET_LISTE, 'A2:C4');
    expect(rows).toHaveLength(3);
    expect(rows[0]![0]).toBe('Crunch poulie haute');
    const beyond = await p.getRange(SHEET_LISTE, 'Z1000:Z1002');
    expect(beyond.every((r) => r[0] === null)).toBe(true);
  });

  it('updateRange écrit des cellules précises ; nombres et booléens round-trip', async () => {
    const { p } = makeProvider();
    await seed(p, buildMockGrid('2026-11-02'));
    await p.updateRange(SHEET_SUIVI, 'C3', [[7.5]]);
    const row = (await p.getRange(SHEET_SUIVI, 'A3:K3'))[0]!;
    expect(row[2]).toBe(7.5);
    expect(row[0]).not.toBeNull();
    await p.updateRange(SHEET_SUIVI, 'L3', [[true]]);
    expect((await p.getRange(SHEET_SUIVI, 'L3'))[0]![0]).toBe(true);
  });

  it('updateRange null efface une cellule', async () => {
    const { p } = makeProvider();
    await seed(p, buildMockGrid('2026-11-02'));
    await p.updateRange(SHEET_SUIVI, 'C3', [[7.5]]);
    await p.updateRange(SHEET_SUIVI, 'C3', [[null]]);
    expect((await p.getRange(SHEET_SUIVI, 'C3'))[0]![0]).toBeNull();
  });

  it('appendRows ajoute après la dernière ligne non vide', async () => {
    const { p } = makeProvider();
    await seed(p, buildMockGrid('2026-11-02'));
    const before = await p.getRange(SHEET_SEANCES, 'A1:A2000');
    const n = before.filter((r) => r[0] != null).length;
    await p.appendRows(SHEET_SEANCES, [['x1', '2026-11-02', 'p', 'Full body', 'd', 'f', 60, 'terminee', null]]);
    const after = await p.getRange(SHEET_SEANCES, `A${n + 1}:A${n + 1}`);
    expect(after[0]![0]).toBe('x1');
  });

  it('REFUSE toute écriture sur les onglets protégés', async () => {
    const { p } = makeProvider();
    await seed(p, buildMockGrid('2026-11-02'));
    for (const tab of [SHEET_LISTE, SHEET_FULL_BODY, SHEET_BILAN]) {
      await expect(p.updateRange(tab, 'A1', [['x']])).rejects.toMatchObject({ statusCode: 403 });
      await expect(p.appendRows(tab, [['x']])).rejects.toMatchObject({ statusCode: 403 });
    }
  });

  it('isolation par utilisateur + Liste partagée (globale)', async () => {
    const db = makeDb();
    const a = new SqliteProvider(db, 'u_a');
    const b = new SqliteProvider(db, 'u_b');
    await seed(a, { Suivi: [['Date'], ['01/11/2026']] });
    // A écrit dans SON Suivi ; B ne le voit pas (onglet inexistant chez lui)
    await a.updateRange(SHEET_SUIVI, 'C2', [[7]]);
    await expect(b.getRange(SHEET_SUIVI, 'A1')).rejects.toMatchObject({ statusCode: 404 });
    // Liste = scope global : visible par les deux une fois créée
    await a.createSheet(SHEET_LISTE);
    await a.writeProvision!(SHEET_LISTE, 'A2', [['Exo global', 'Dos', '']]);
    expect((await b.getRange(SHEET_LISTE, 'A2'))[0]![0]).toBe('Exo global');
  });
});

describe('Repositories sur SQLite', () => {
  it('ExerciseRepository + Settings + fin de séance fonctionnent à l’identique', async () => {
    const { p } = makeProvider();
    await seed(p, buildMockGrid('2026-11-02'));

    const exos = await new ExerciseRepository(p).list();
    expect(exos).toHaveLength(92);

    const settings = new SettingsRepository(p);
    const s0 = await settings.get();
    expect((await settings.update({ ...s0, objectifCalories: 2600 })).objectifCalories).toBe(2600);

    const repo = new SessionRepository(p, TZ);
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
          sets: [{ serie: 1, chargeKg: 60, repetitions: 10, terminee: true, notes: null }],
        },
      ],
    });
    const reread = await repo.get(s.id);
    expect(reread.exercices[0]!.sets).toHaveLength(1);
  });

  it('provisionSpreadsheet fonctionne sur SQLite (onglets + seed Liste global)', async () => {
    const db = makeDb();
    const a = new SqliteProvider(db, 'u_a');
    const res = await provisionSpreadsheet(a);
    expect(res.tabs).toContain(SHEET_SUIVI);
    // Liste seedée dans le scope global → visible par un autre utilisateur
    const b = new SqliteProvider(db, 'u_b');
    const exos = await new ExerciseRepository(b).list();
    expect(exos.length).toBeGreaterThan(80);
  });
});
