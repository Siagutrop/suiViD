import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnv } from '../src/env.js';
import { UserStore, verifyPassword, DEMO_USER_EMAIL, DEMO_USER_PASSWORD } from '../src/users/store.js';

function env(over: Record<string, string> = {}) {
  return loadEnv({
    DATA_MODE: 'mock',
    AUTH_SECRET: 'x'.repeat(16),
    LOG_LEVEL: 'error',
    USERS_FILE: ':memory:',
    ...over,
  });
}

describe('UserStore — comptes multi-utilisateur', () => {
  it('hash scrypt : vérification ok, mauvais mot de passe refusé', () => {
    const store = new UserStore(env());
    const u = store.create('a@b.fr', 'motdepasse');
    expect(verifyPassword(u.passwordHash, 'motdepasse')).toBe(true);
    expect(verifyPassword(u.passwordHash, 'autre')).toBe(false);
    expect(u.passwordHash).not.toContain('motdepasse');
  });

  it('refuse les doublons d’e-mail (insensible à la casse)', () => {
    const store = new UserStore(env());
    store.create('a@b.fr', 'x');
    expect(() => store.create('A@B.fr', 'y')).toThrowError(/déjà/);
  });

  it('persiste et recharge depuis le fichier JSON', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'suivid-'));
    const file = join(dir, 'users.json');
    const store = new UserStore(env({ USERS_FILE: file }));
    const u = store.create('persist@test.fr', 'secret123');
    await store.setSpreadsheet(u.id, 'SPREADSHEET_ID_1234567890abcdef');
    await store.persist();
    expect(existsSync(file)).toBe(true);
    // Le mot de passe n'apparaît jamais en clair dans le fichier
    expect(readFileSync(file, 'utf-8')).not.toContain('secret123');
    // Rechargement dans un nouveau store
    const store2 = new UserStore(env({ USERS_FILE: file }));
    const u2 = store2.byEmail('persist@test.fr');
    expect(u2?.spreadsheetId).toBe('SPREADSHEET_ID_1234567890abcdef');
    expect(verifyPassword(u2!.passwordHash, 'secret123')).toBe(true);
  });

  it('un utilisateur sans classeur lié a spreadsheetId null', () => {
    const store = new UserStore(env());
    const u = store.create('nosheet@test.fr', 'x'.repeat(8));
    expect(u.spreadsheetId).toBeNull();
  });
});

describe('API multi-utilisateur', () => {
  let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;

  beforeAll(async () => {
    const { buildApp, buildContext } = await import('../src/app.js');
    app = await buildApp(buildContext(env()));
  });

  it('seed démo : login demo@suivid.app / dev', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: DEMO_USER_EMAIL, password: DEMO_USER_PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().token).toBeTruthy();
  });

  it('mauvais mot de passe -> 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: DEMO_USER_EMAIL, password: 'faux' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('signup crée un compte utilisable immédiatement', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'nouveau@test.fr', password: 'pass1234' },
    });
    expect(res.statusCode).toBe(200);
    const token = res.json().token;
    const me = await app.inject({ url: '/api/me', headers: { authorization: `Bearer ${token}` } });
    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe('nouveau@test.fr');
  });

  it('deux utilisateurs ont des jetons et identités distincts', async () => {
    const login = (email: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password: email === DEMO_USER_EMAIL ? DEMO_USER_PASSWORD : 'pass1234' },
      });
    const [a, b] = [await login(DEMO_USER_EMAIL), await login('nouveau@test.fr')];
    expect(a.json().token).not.toBe(b.json().token);
    const meA = await app.inject({ url: '/api/me', headers: { authorization: `Bearer ${a.json().token}` } });
    const meB = await app.inject({ url: '/api/me', headers: { authorization: `Bearer ${b.json().token}` } });
    expect(meA.json().id).not.toBe(meB.json().id);
    expect(meA.json().email).toBe(DEMO_USER_EMAIL);
    expect(meB.json().email).toBe('nouveau@test.fr');
  });

  it('chaque utilisateur accède à ses données via son propre contexte', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nouveau@test.fr', password: 'pass1234' },
    });
    const h = { authorization: `Bearer ${login.json().token}` };
    const res = await app.inject({ url: '/api/exercices', headers: h });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBeGreaterThan(50);
  });

  it('le lien de classeur est simulé en mode démo (setup testable)', async () => {
    const signup = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'sans-sheet@test.fr', password: 'pass1234' },
    });
    const token = signup.json().token;
    // needsSetup vrai tant que rien n'est lié
    const meBefore = await app.inject({ url: '/api/me', headers: { authorization: `Bearer ${token}` } });
    expect(meBefore.json().needsSetup).toBe(true);
    // Liaison simulée
    const res = await app.inject({
      method: 'POST',
      url: '/api/me/spreadsheet',
      headers: { authorization: `Bearer ${token}` },
      payload: { url: 'https://docs.google.com/spreadsheets/d/abc123456789012345678901234/edit' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().linked).toBe(true);
    const meAfter = await app.inject({ url: '/api/me', headers: { authorization: `Bearer ${token}` } });
    expect(meAfter.json().needsSetup).toBe(false);
  });

  it('un lien de classeur invalide -> 400', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: DEMO_USER_EMAIL, password: DEMO_USER_PASSWORD },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/me/spreadsheet',
      headers: { authorization: `Bearer ${login.json().token}` },
      payload: { url: 'pas-un-lien-valide' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('signup avec mot de passe trop court -> 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'court@test.fr', password: '123' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('signup avec e-mail invalide -> 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'pas-un-email', password: 'pass1234' },
    });
    expect(res.statusCode).toBe(400);
  });
});
