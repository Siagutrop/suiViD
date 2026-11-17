import webpush from 'web-push';
import type { Env } from './env.js';
import type { UserStore } from './users/store.js';

// ------------------------------------------------------------------
// Notifications Web Push (rappels de séance) — clés VAPID dans l'env.
// Inactif silencieusement si les clés ne sont pas configurées.
// ------------------------------------------------------------------

export interface PushPayload {
  title: string;
  body: string;
  /** Route ouverte au clic sur la notification. */
  url?: string;
}

export class PushService {
  readonly enabled: boolean;
  readonly publicKey: string | null;
  readonly hour: number;
  private users: UserStore;

  constructor(env: Env, users: UserStore) {
    this.users = users;
    this.enabled = !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
    this.publicKey = env.VAPID_PUBLIC_KEY ?? null;
    this.hour = env.PUSH_REMINDER_HOUR;
    if (this.enabled) {
      webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
    }
  }

  /** Envoie à toutes les souscriptions de l'utilisateur ; purge les endpoints révoqués. */
  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    const subs = this.users.byId(userId)?.pushSubs ?? [];
    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(payload),
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Endpoint expiré/révoqué côté navigateur — on le purge.
          await this.users.removePushSub(userId, sub.endpoint);
        }
      }
    }
    return sent;
  }
}
