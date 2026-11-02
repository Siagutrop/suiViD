import { describe, expect, it } from 'vitest';
import {
  addDays,
  average,
  exerciseProgress,
  movingAverage,
  seriesByDay,
  sessionVolume,
  weeklyAverage,
  type JournalEntry,
  type Session,
} from '@suivi/shared';

const entry = (date: string, poids: number | null, calories: number | null = null): JournalEntry => ({
  date,
  week: null,
  sommeil: null,
  forme: null,
  poids,
  calories,
  glucides: null,
  proteines: null,
  lipides: null,
  pas: null,
  entrainement: null,
});

describe('statistiques — valeurs absentes ≠ 0', () => {
  it('movingAverage ignore les trous au lieu de les compter comme 0', () => {
    const pts = [
      { date: '2026-10-30', value: 80 },
      { date: '2026-10-31', value: null },
      { date: '2026-11-01', value: 78 },
    ];
    const ma = movingAverage(pts, 3);
    expect(ma[2]!.value).toBe(79); // (80+78)/2, pas (80+0+78)/3
  });

  it('average retourne null si toutes les valeurs sont absentes', () => {
    expect(average([null, null])).toBeNull();
    expect(average([null, 10, 20])).toBe(15);
  });

  it('seriesByDay aligne sur les jours calendaires avec trous à null', () => {
    const today = '2026-11-02';
    const s = seriesByDay([entry(addDays(today, -1), 78.5)], 'poids', 3, today);
    expect(s).toEqual([
      { date: '2026-10-31', value: null },
      { date: '2026-11-01', value: 78.5 },
      { date: '2026-11-02', value: null },
    ]);
  });

  it('weeklyAverage regroupe par semaine (lundi)', () => {
    const pts = [
      { date: '2026-10-27', value: 80 }, // mardi sem A
      { date: '2026-10-29', value: 78 }, // jeudi sem A
      { date: '2026-11-02', value: 77 }, // lundi sem B
    ];
    const w = weeklyAverage(pts);
    expect(w).toHaveLength(2);
    expect(w[0]!.value).toBe(79);
    expect(w[1]!.value).toBe(77);
  });
});

const session: Session = {
  id: 's1',
  date: '2026-11-01',
  programmeId: 'p',
  programmeNom: 'Full body',
  debut: '2026-11-01T18:00:00+01:00',
  fin: '2026-11-01T19:00:00+01:00',
  dureeSec: 3600,
  statut: 'terminee',
  notes: null,
  exercices: [
    {
      exercice: 'DC Smith',
      ordre: 1,
      passee: false,
      sets: [
        { serie: 1, chargeKg: 60, repetitions: 10, terminee: true, notes: null },
        { serie: 2, chargeKg: 62.5, repetitions: 8, terminee: true, notes: null },
        { serie: 3, chargeKg: 65, repetitions: 0, terminee: false, notes: null },
      ],
    },
  ],
};

describe('statistiques sportives', () => {
  it('sessionVolume = Σ charge×reps des séries terminées', () => {
    expect(sessionVolume(session)).toBe(60 * 10 + 62.5 * 8);
  });

  it('exerciseProgress retourne la meilleure charge par date', () => {
    const prog = exerciseProgress([session], 'DC Smith');
    expect(prog).toEqual([{ date: '2026-11-01', chargeKg: 62.5, repetitions: 8 }]);
  });
});

describe('sécurité — pas de fuite de secrets', () => {
  it('la config n’expose jamais les clés Google dans les réponses API', async () => {
    const { buildApp, buildContext } = await import('../src/app.js');
    const { loadEnv } = await import('../src/env.js');
    const env = loadEnv({
      DATA_MODE: 'mock',
      AUTH_SECRET: 'x'.repeat(16),
      LOG_LEVEL: 'error',
      USERS_FILE: ':memory:',
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: 'SECRET_KEY',
      GOOGLE_OAUTH_REFRESH_TOKEN: 'SECRET_TOKEN',
      GOOGLE_SPREADSHEET_ID: 'SPREADSHEET_SECRET_ID',
    });
    const app = await buildApp(buildContext(env));
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'demo@suivid.app', password: 'dev' },
    });
    const h = { authorization: `Bearer ${login.json().token}` };
    for (const path of ['/api/meta', '/api/journal/today', '/api/exercices', '/api/parametres']) {
      const res = await app.inject({ url: path, headers: h });
      expect(res.body).not.toContain('SECRET_KEY');
      expect(res.body).not.toContain('SECRET_TOKEN');
      expect(res.body).not.toContain('SPREADSHEET_SECRET_ID');
    }
    await app.close();
  }, 30000);

  it('les routes protégées exigent un jeton', async () => {
    const { buildApp, buildContext } = await import('../src/app.js');
    const { loadEnv } = await import('../src/env.js');
    const env = loadEnv({
      DATA_MODE: 'mock',
      AUTH_SECRET: 'x'.repeat(16),
      LOG_LEVEL: 'error',
      USERS_FILE: ':memory:',
    });
    const app = await buildApp(buildContext(env));
    for (const path of ['/api/meta', '/api/journal/today', '/api/programmes']) {
      const res = await app.inject({ url: path });
      expect(res.statusCode).toBe(401);
    }
    await app.close();
  });
});
