import { describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { FastifyRequest } from 'fastify';
import { loadEnv } from '../src/env.js';
import { UserStore } from '../src/users/store.js';
import { WebAuthnService } from '../src/webauthn.js';
import type { AppContext } from '../src/app.js';
import type { Env } from '../src/env.js';

function env(over: Record<string, string> = {}): Env {
  return loadEnv({
    DATA_MODE: 'mock',
    AUTH_SECRET: 'x'.repeat(16),
    LOG_LEVEL: 'error',
    USERS_FILE: ':memory:',
    CORS_ORIGIN: 'http://localhost:5173',
    ...over,
  });
}

const req = (origin = 'http://localhost:5173') =>
  ({ headers: { origin } }) as FastifyRequest;

const rec = {
  id: 'pk_1',
  credentialId: 'Y3JlZA',
  publicKey: 'a2V5',
  counter: 0,
  transports: ['internal'],
  createdAt: '2026-11-16T00:00:00Z',
};

describe('UserStore — passkeys', () => {
  it('ajoute puis retire une passkey', async () => {
    const s = new UserStore(env());
    const u = s.create('pk@test.fr', 'pass1234');
    expect(u.passkeys ?? []).toHaveLength(0);
    await s.addPasskey(u.id, rec);
    expect(s.byId(u.id)!.passkeys).toHaveLength(1);
    expect(await s.removePasskey(u.id, 'pk_1')).toBe(true);
    expect(s.byId(u.id)!.passkeys).toHaveLength(0);
    expect(await s.removePasskey(u.id, 'pk_1')).toBe(false);
  });

  it('addPasskey fait un upsert par id (compteur mis à jour)', async () => {
    const s = new UserStore(env());
    const u = s.create('pk2@test.fr', 'pass1234');
    await s.addPasskey(u.id, rec);
    await s.addPasskey(u.id, { ...rec, counter: 7 });
    expect(s.byId(u.id)!.passkeys).toHaveLength(1);
    expect(s.byId(u.id)!.passkeys![0]!.counter).toBe(7);
  });
});

describe('WebAuthnService — config', () => {
  it('enabled avec CORS_ORIGIN=http://localhost:5173', () => {
    expect(new WebAuthnService(env()).enabled).toBe(true);
  });

  it('CORS_ORIGIN=* sans WEBAUTHN_RP_ID → désactivé', () => {
    expect(new WebAuthnService(env({ CORS_ORIGIN: '*' })).enabled).toBe(false);
  });

  it('WEBAUTHN_RP_ID explicite réactive même avec CORS_ORIGIN=*', () => {
    expect(new WebAuthnService(env({ CORS_ORIGIN: '*', WEBAUTHN_RP_ID: 'suivid.example.com' })).enabled).toBe(true);
  });
});

describe('WebAuthnService — options / challenges', () => {
  function svc(over: Record<string, string> = {}) {
    const e = env(over);
    const users = new UserStore(e);
    return { wa: new WebAuthnService(e), users };
  }

  it('authenticationOptions → options + challengeId pour user avec passkey', async () => {
    const { wa, users } = svc();
    const u = users.create('a@b.fr', 'pass1234');
    await users.addPasskey(u.id, rec);
    const out = (await wa.authenticationOptions(req(), u)) as {
      challengeId: string;
      options: { challenge: string; allowCredentials: { id: string }[] };
    };
    expect(out.challengeId).toBeTruthy();
    expect(out.options.challenge).toBeTruthy();
    expect(out.options.allowCredentials[0]!.id).toBe(rec.credentialId);
  });

  it('authenticationOptions → 400 quand désactivé (CORS_ORIGIN=*)', async () => {
    const { wa, users } = svc({ CORS_ORIGIN: '*' });
    const u = users.create('x@b.fr', 'pass1234');
    await users.addPasskey(u.id, rec);
    await expect(wa.authenticationOptions(req(), u)).rejects.toMatchObject({ statusCode: 400 });
    await expect(wa.registrationOptions(req(), u)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('challenge consommé : un challengeId ne sert qu\'une fois', async () => {
    const { wa, users } = svc();
    const u = users.create('c@b.fr', 'pass1234');
    await users.addPasskey(u.id, rec);
    const { challengeId } = (await wa.authenticationOptions(req(), u)) as { challengeId: string };
    const bogus = { id: rec.credentialId, rawId: rec.credentialId, type: 'public-key', response: {} };
    // Assertion invalide → 400 ; le challenge est consommé par la tentative
    await expect(
      wa.verifyAuthentication(req(), challengeId, u, bogus as never),
    ).rejects.toMatchObject({ statusCode: 400 });
    // Même challengeId rejoué → 400 immédiat (plus de défi valide)
    await expect(
      wa.verifyAuthentication(req(), challengeId, u, bogus as never),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('challengeId d\'un autre utilisateur refusé', async () => {
    const { wa, users } = svc();
    const u1 = users.create('u1@b.fr', 'pass1234');
    const u2 = users.create('u2@b.fr', 'pass1234');
    await users.addPasskey(u1.id, rec);
    await users.addPasskey(u2.id, { ...rec, id: 'pk_2' });
    const { challengeId } = (await wa.authenticationOptions(req(), u1)) as { challengeId: string };
    const bogus = { id: rec.credentialId, rawId: rec.credentialId, type: 'public-key', response: {} };
    await expect(
      wa.verifyAuthentication(req(), challengeId, u2, bogus as never),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('verifyAuthentication → passkey inconnue = 400', async () => {
    const { wa, users } = svc();
    const u = users.create('v@b.fr', 'pass1234');
    await users.addPasskey(u.id, rec);
    const { challengeId } = (await wa.authenticationOptions(req(), u)) as { challengeId: string };
    const bogus = { id: 'autre-cred', rawId: 'autre-cred', type: 'public-key', response: {} };
    await expect(
      wa.verifyAuthentication(req(), challengeId, u, bogus as never),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ------------------------------------------------------------------
// Intégration HTTP — routes /api/auth/passkey/* et /api/me/passkeys
// ------------------------------------------------------------------

describe('API passkeys', () => {
  let app: FastifyInstance;
  let ctx: AppContext;

  beforeAll(async () => {
    const { buildApp, buildContext } = await import('../src/app.js');
    ctx = buildContext(env());
    app = await buildApp(ctx);
  });

  async function signup(email: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email, password: 'pass1234' },
    });
    expect(res.statusCode).toBe(200);
    return { token: res.json().token as string, email };
  }
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  it('exists → enabled+exists reflètent l’état', async () => {
    const { email } = await signup('pk-exists@test.fr');
    const before = await app.inject({
      method: 'POST',
      url: '/api/auth/passkey/exists',
      payload: { email },
    });
    expect(before.statusCode).toBe(200);
    expect(before.json()).toEqual({ enabled: true, exists: false });
    const user = ctx.users.byEmail(email)!;
    await ctx.users.addPasskey(user.id, rec);
    const after = await app.inject({
      method: 'POST',
      url: '/api/auth/passkey/exists',
      payload: { email },
    });
    expect(after.json()).toEqual({ enabled: true, exists: true });
  });

  it('login/options → 404 inconnu/sans passkey, options sinon, 403 si disabled', async () => {
    const { email } = await signup('pk-login@test.fr');
    const noPk = await app.inject({
      method: 'POST',
      url: '/api/auth/passkey/login/options',
      payload: { email },
    });
    expect(noPk.statusCode).toBe(404);

    const user = ctx.users.byEmail(email)!;
    await ctx.users.addPasskey(user.id, rec);
    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/passkey/login/options',
      payload: { email },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().options.allowCredentials[0].id).toBe(rec.credentialId);
    expect(ok.json().challengeId).toBeTruthy();

    await ctx.users.update(user.id, { disabled: true });
    const dis = await app.inject({
      method: 'POST',
      url: '/api/auth/passkey/login/options',
      payload: { email },
    });
    expect(dis.statusCode).toBe(403);
    await ctx.users.update(user.id, { disabled: false });
  });

  it('login/verify → 400 sans challenge valide', async () => {
    const { email } = await signup('pk-verify@test.fr');
    const user = ctx.users.byEmail(email)!;
    await ctx.users.addPasskey(user.id, rec);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/passkey/login/verify',
      payload: {
        email,
        challengeId: 'ch_inexistant123',
        response: { id: rec.credentialId, rawId: rec.credentialId, type: 'public-key', response: {} },
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('register/options sans token → 401 ; avec token → challengeId+options', async () => {
    const anon = await app.inject({ method: 'POST', url: '/api/auth/passkey/register/options' });
    expect(anon.statusCode).toBe(401);
    const { token } = await signup('pk-reg@test.fr');
    const res = await app.inject({ method: 'POST', url: '/api/auth/passkey/register/options', headers: auth(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().challengeId).toBeTruthy();
    expect(res.json().options.challenge).toBeTruthy();
  });

  it('register/verify avec challenge bidon → 400', async () => {
    const { token } = await signup('pk-regv@test.fr');
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/passkey/register/verify',
      headers: auth(token),
      payload: { challengeId: 'ch_bidon123456', response: {} },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /me/passkeys → [] puis liste après addPasskey', async () => {
    const { token, email } = await signup('pk-list@test.fr');
    const empty = await app.inject({ url: '/api/me/passkeys', headers: auth(token) });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual([]);
    const user = ctx.users.byEmail(email)!;
    await ctx.users.addPasskey(user.id, rec);
    const filled = await app.inject({ url: '/api/me/passkeys', headers: auth(token) });
    expect(filled.json()).toHaveLength(1);
    expect(filled.json()[0].id).toBe(rec.id);
    expect(filled.json()[0].publicKey).toBeUndefined();
  });

  it('DELETE /me/passkeys/:id → 404 inconnu ; 200 puis GET vide', async () => {
    const { token, email } = await signup('pk-del@test.fr');
    const user = ctx.users.byEmail(email)!;
    await ctx.users.addPasskey(user.id, rec);
    const missing = await app.inject({
      method: 'DELETE',
      url: '/api/me/passkeys/pk_inconnu',
      headers: auth(token),
    });
    expect(missing.statusCode).toBe(404);
    const ok = await app.inject({
      method: 'DELETE',
      url: `/api/me/passkeys/${rec.id}`,
      headers: auth(token),
    });
    expect(ok.statusCode).toBe(200);
    const after = await app.inject({ url: '/api/me/passkeys', headers: auth(token) });
    expect(after.json()).toEqual([]);
  });

  it('/api/me contient webauthn.enabled', async () => {
    const { token } = await signup('pk-me@test.fr');
    const me = await app.inject({ url: '/api/me', headers: auth(token) });
    expect(me.statusCode).toBe(200);
    expect(me.json().webauthn).toEqual({ enabled: true });
  });
});

describe('API passkeys — désactivé (CORS_ORIGIN=*)', () => {
  it('exists → {enabled:false,exists:false} ; login/options → 400', async () => {
    const { buildApp, buildContext } = await import('../src/app.js');
    const c = buildContext(env({ CORS_ORIGIN: '*' }));
    const a = await buildApp(c);
    const res = await a.inject({
      method: 'POST',
      url: '/api/auth/passkey/exists',
      payload: { email: 'demo@suivid.app' },
    });
    expect(res.json()).toEqual({ enabled: false, exists: false });
    const user = c.users.byEmail('demo@suivid.app')!;
    await c.users.addPasskey(user.id, rec);
    const opts = await a.inject({
      method: 'POST',
      url: '/api/auth/passkey/login/options',
      payload: { email: 'demo@suivid.app' },
    });
    expect(opts.statusCode).toBe(400);
    await a.close();
  });
});
