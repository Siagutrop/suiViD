import { describe, it, expect } from 'vitest';
import webpush from 'web-push';
import { loadEnv } from '../src/env.js';
import { buildApp, buildContext } from '../src/app.js';
import { UserStore } from '../src/users/store.js';
import { PushService } from '../src/push.js';
import type { Env } from '../src/env.js';

function env(over: Record<string, string> = {}): Env {
  return loadEnv({
    DATA_MODE: 'mock',
    AUTH_SECRET: 'x'.repeat(16),
    LOG_LEVEL: 'error',
    USERS_FILE: ':memory:',
    AUTH_RATE_LIMIT_MAX: '500',
    ...over,
  });
}

const VAPID = webpush.generateVAPIDKeys();

const SUB = {
  endpoint: 'https://push.example.com/sub/abc123',
  keys: { p256dh: 'BPc1fF6bC3Q', auth: 'c2VjcmV0' },
};

async function appWith(over: Record<string, string> = {}) {
  const app = await buildApp(buildContext(env(over)));
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'demo@suivid.app', password: 'dev' },
  });
  const headers = { authorization: `Bearer ${login.json().token}` };
  return { app, headers };
}

const vapidEnv = () => ({
  VAPID_PUBLIC_KEY: VAPID.publicKey,
  VAPID_PRIVATE_KEY: VAPID.privateKey,
});

describe('UserStore — souscriptions push', () => {
  it('ajoute, déduplique par endpoint, marque puis retire', async () => {
    const s = new UserStore(env());
    const u = s.create('push@test.fr', 'pass1234');
    await s.addPushSub(u.id, { ...SUB, createdAt: '2026-11-16T00:00:00Z' });
    // Même endpoint → upsert, pas de doublon.
    await s.addPushSub(u.id, { ...SUB, createdAt: '2026-11-17T00:00:00Z' });
    expect(s.byId(u.id)!.pushSubs).toHaveLength(1);

    await s.markReminderSent(u.id, SUB.endpoint, '2026-11-17');
    expect(s.byId(u.id)!.pushSubs![0]!.lastReminderDate).toBe('2026-11-17');

    expect(await s.removePushSub(u.id, SUB.endpoint)).toBe(true);
    expect(await s.removePushSub(u.id, SUB.endpoint)).toBe(false);
  });
});

describe('PushService — activation VAPID', () => {
  it('désactivé sans clés, activé avec une paire valide', () => {
    expect(new PushService(env(), new UserStore(env())).enabled).toBe(false);
    const on = new PushService(env(vapidEnv()), new UserStore(env()));
    expect(on.enabled).toBe(true);
    expect(on.publicKey).toBe(VAPID.publicKey);
    expect(on.hour).toBe(18);
  });
});

describe('Routes /api/me/push', () => {
  it('sans VAPID : GET désactivé, POST → 503', async () => {
    const { app, headers } = await appWith();
    const get = await app.inject({ url: '/api/me/push', headers });
    expect(get.statusCode).toBe(200);
    expect(get.json()).toMatchObject({ enabled: false, publicKey: null, subscribed: false, hour: 18 });

    const post = await app.inject({ method: 'POST', url: '/api/me/push', headers, payload: SUB });
    expect(post.statusCode).toBe(503);
  });

  it('avec VAPID : souscription → subscribed, DELETE → désabonné', async () => {
    const { app, headers } = await appWith(vapidEnv());
    const get0 = await app.inject({ url: '/api/me/push', headers });
    expect(get0.json()).toMatchObject({ enabled: true, publicKey: VAPID.publicKey, subscribed: false });

    const post = await app.inject({ method: 'POST', url: '/api/me/push', headers, payload: SUB });
    expect(post.statusCode).toBe(200);
    expect((await app.inject({ url: '/api/me/push', headers })).json().subscribed).toBe(true);

    const del = await app.inject({
      method: 'DELETE',
      url: '/api/me/push',
      headers,
      payload: { endpoint: SUB.endpoint },
    });
    expect(del.statusCode).toBe(200);
    expect((await app.inject({ url: '/api/me/push', headers })).json().subscribed).toBe(false);
  });

  it('POST avec un body invalide → 400', async () => {
    const { app, headers } = await appWith(vapidEnv());
    const res = await app.inject({
      method: 'POST',
      url: '/api/me/push',
      headers,
      payload: { endpoint: 'pas-une-url', keys: {} },
    });
    expect(res.statusCode).toBe(400);
  });
});
