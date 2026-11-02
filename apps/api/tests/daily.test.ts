import { describe, expect, it } from 'vitest';
import { addDays, SHEET_SUIVI, todayInTimezone } from '@suivi/shared';
import { DailyTrackingRepository } from '../src/repositories/DailyTrackingRepository.js';
import { parseA1 } from '../src/providers/a1.js';
import { fr, providerWith, suiviGrid } from './helpers.js';

const TZ = 'Europe/Paris';
const TODAY = todayInTimezone(TZ);
const YESTERDAY = addDays(TODAY, -1);

function repo(suivi: ReturnType<typeof suiviGrid>) {
  return new DailyTrackingRepository(providerWith({ [SHEET_SUIVI]: suivi }), TZ);
}

describe('DailyTrackingRepository — correspondance date → ligne', () => {
  it('retrouve la ligne du jour et pré-remplit les valeurs', async () => {
    const r = repo(
      suiviGrid([
        [fr(YESTERDAY), 44, 7, 8, 78.4, 2300, 200, 160, 75, 9000, 'Full body'],
        [fr(TODAY), 45],
      ]),
    );
    const res = await r.getToday();
    expect(res.rowMissing).toBe(false);
    expect(res.rowIndex).toBe(3);
    expect(res.entry.date).toBe(TODAY);
    expect(res.entry.week).toBe(45);
    expect(res.entry.sommeil).toBeNull();
  });

  it('rowMissing si aucune ligne ne correspond à aujourd’hui — jamais de création', async () => {
    const r = repo(suiviGrid([[fr(YESTERDAY), 44]]));
    const res = await r.getToday();
    expect(res.rowMissing).toBe(true);
    await expect(r.updateToday({ poids: 78 })).rejects.toMatchObject({
      statusCode: 404,
      code: 'ROW_MISSING',
    });
  });

  it('traite « - » et les cellules vides comme valeurs absentes', async () => {
    const r = repo(
      suiviGrid([[fr(TODAY), 45, '-', '-', '-', '-', '-', '-', '-', '-', '-']]),
    );
    const res = await r.getToday();
    expect(res.entry.poids).toBeNull();
    expect(res.entry.calories).toBeNull();
    expect(res.entry.entrainement).toBeNull();
  });

  it('accepte les décimales FR « 78,5 » en lecture', async () => {
    const r = repo(suiviGrid([[fr(TODAY), 45, '7,5', 8, '78,5', 2300, 200, 160, 75, 9000, 'FB']]));
    const res = await r.getToday();
    expect(res.entry.sommeil).toBe(7.5);
    expect(res.entry.poids).toBe(78.5);
  });
});

describe('DailyTrackingRepository — règles d’écriture', () => {
  it('écrit uniquement les cellules modifiées dans C..K', async () => {
    const provider = providerWith({
      [SHEET_SUIVI]: suiviGrid([[fr(TODAY), 45, 7, 8, 78.4, 2300, 200, 160, 75, 9000, 'Repos']]),
    });
    const r = new DailyTrackingRepository(provider, TZ);
    const res = await r.updateToday(
      { poids: 78.9 },
      { sommeil: 7, forme: 8, poids: 78.4, calories: 2300, glucides: 200, proteines: 160, lipides: 75, pas: 9000, entrainement: 'Repos' },
    );
    expect(res.written).toEqual(['poids']);
    const grid = await provider.getRange(SHEET_SUIVI, 'A1:K2');
    expect(grid[1]![4]).toBe(78.9); // E2 = poids
    expect(grid[1]![2]).toBe(7); // C2 inchangée
    expect(grid[1]![10]).toBe('Repos'); // K2 inchangée
    expect(grid[1]![0]).toBe(fr(TODAY)); // A2 jamais touchée
    expect(grid[1]![1]).toBe(45); // B2 jamais touchée
  });

  it('ne modifie jamais un autre jour : seule la ligne du jour est écrite', async () => {
    const provider = providerWith({
      [SHEET_SUIVI]: suiviGrid([
        [fr(YESTERDAY), 44],
        [fr(TODAY), 45],
      ]),
    });
    const r = new DailyTrackingRepository(provider, TZ);
    await r.updateToday({ poids: 78 }, { poids: null });
    const grid = await provider.getRange(SHEET_SUIVI, 'A2:K3');
    expect(grid[0]![4] ?? null).toBeNull(); // hier : inchangé
    expect(grid[1]![4]).toBe(78); // aujourd'hui : écrit
  });

  it('détecte les conflits quand base ≠ courant', async () => {
    const r = repo(suiviGrid([[fr(TODAY), 45, 7, null, 78.4]]));
    await expect(
      r.updateToday({ poids: 79 }, { poids: 78.0 }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
  });

  it('sans base, écraser une cellule remplie est un conflit ; force=true confirme', async () => {
    const r = repo(suiviGrid([[fr(TODAY), 45, 7, null, 78.4]]));
    await expect(r.updateToday({ poids: 79 })).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    });
    const ok = await r.updateToday({ poids: 79 }, undefined, true);
    expect(ok.entry.poids).toBe(79);
  });

  it('les cellules non envoyées ne sont pas écrites (saisie partielle)', async () => {
    const provider = providerWith({
      [SHEET_SUIVI]: suiviGrid([[fr(TODAY), 45, 7.2, 6, 78.4]]),
    });
    const r = new DailyTrackingRepository(provider, TZ);
    await r.updateToday(
      { pas: 10000 },
      { sommeil: 7.2, forme: 6, poids: 78.4 },
    );
    const row = (await provider.getRange(SHEET_SUIVI, 'A2:K2'))[0]!;
    expect(row[9]).toBe(10000);
    expect(row[2]).toBe(7.2);
  });

  it('null réécrit le placeholder « - » (convention du fichier)', async () => {
    const provider = providerWith({
      [SHEET_SUIVI]: suiviGrid([[fr(TODAY), 45, 7.2, null, 78.4]]),
    });
    const r = new DailyTrackingRepository(provider, TZ);
    await r.updateToday({ sommeil: null }, { sommeil: 7.2 });
    const row = (await provider.getRange(SHEET_SUIVI, 'A2:K2'))[0]!;
    expect(row[2]).toBe('-');
  });
});

describe('parseA1', () => {
  it('parse cellules et plages', () => {
    expect(parseA1('C5')).toEqual({ colStart: 3, rowStart: 5, colEnd: 3, rowEnd: 5 });
    expect(parseA1('A2:K33')).toEqual({ colStart: 1, rowStart: 2, colEnd: 11, rowEnd: 33 });
  });
});
