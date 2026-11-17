import type { FastifyBaseLogger } from 'fastify';
import type { AppContext } from './app.js';

// ------------------------------------------------------------------
// Rappels de séance : un tick/minute. Pendant l'heure configurée
// (PUSH_REMINDER_HOUR, heure de Paris), notifie chaque utilisateur
// dont le jour courant est un jour planifié (joursSeance) et qui n'a
// pas encore de séance terminée aujourd'hui. Un rappel par jour max —
// la date d'envoi est persistée sur chaque souscription.
// ------------------------------------------------------------------

const TZ = 'Europe/Paris';
const TICK_MS = 60_000;

function parisNow(): { date: string; day: number; hour: number } {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, '0');
  const d = `${now.getDate()}`.padStart(2, '0');
  return { date: `${y}-${m}-${d}`, day: now.getDay(), hour: now.getHours() };
}

export function startReminders(ctx: AppContext, log: FastifyBaseLogger): void {
  const timer = setInterval(() => {
    void runReminders(ctx, log).catch((err) => log.warn({ err }, 'rappels : tick échoué'));
  }, TICK_MS);
  // Ne maintient ni le process ni les tests en vie.
  timer.unref();
}

async function runReminders(ctx: AppContext, log: FastifyBaseLogger): Promise<void> {
  const now = parisNow();
  if (now.hour !== ctx.push.hour) return;
  for (const user of ctx.users.list()) {
    if (user.disabled) continue;
    const subs = user.pushSubs ?? [];
    if (subs.length === 0 || subs.every((s) => s.lastReminderDate === now.date)) continue;
    try {
      const { settings, sessions } = await ctx.forUser(user.id);
      const cfg = await settings.get();
      if (!cfg.joursSeance.includes(now.day)) continue;
      const done = (await sessions.list(10)).some(
        (s) => s.date === now.date && s.statut === 'terminee',
      );
      if (!done) {
        const sent = await ctx.push.sendToUser(user.id, {
          title: 'Séance du jour',
          body: 'Ta séance est prévue aujourd’hui — on y va ?',
          url: '/seances',
        });
        if (sent > 0) log.info({ userId: user.id, sent }, 'rappel de séance envoyé');
      }
      // Rappel traité pour aujourd'hui (envoyé ou séance déjà faite).
      await Promise.all(
        subs.map((s) => ctx.users.markReminderSent(user.id, s.endpoint, now.date)),
      );
    } catch (err) {
      log.warn({ err, userId: user.id }, 'rappel : utilisateur ignoré');
    }
  }
}
