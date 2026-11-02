import type { JournalEntry, Session } from './types.js';
import { lastNDays } from './time.js';

// ------------------------------------------------------------------
// Calculs statistiques — valeurs absentes (null) ≠ 0, toujours ignorées
// des moyennes et affichées comme trous dans les graphiques.
// ------------------------------------------------------------------

/** Moyenne mobile sur `window` jours d'une série date/valeur. */
export function movingAverage(
  points: { date: string; value: number | null }[],
  window: number,
): { date: string; value: number | null }[] {
  return points.map((p, i) => {
    const slice = points.slice(Math.max(0, i - window + 1), i + 1);
    const nums = slice.map((s) => s.value).filter((v): v is number => v !== null);
    return { date: p.date, value: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null };
  });
}

export function average(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

export function sum(values: (number | null)[]): number {
  return values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}

/** Série complète sur n jours jusqu'à today, alignée sur les entrées du journal. */
export function seriesByDay(
  entries: JournalEntry[],
  field: keyof JournalEntry,
  n: number,
  today: string,
): { date: string; value: number | null }[] {
  const map = new Map(entries.map((e) => [e.date, e]));
  return lastNDays(today, n).map((date) => {
    const v = map.get(date)?.[field];
    return { date, value: typeof v === 'number' ? v : null };
  });
}

/** Évolution hebdomadaire : moyenne par semaine ISO des valeurs présentes. */
export function weeklyAverage(
  points: { date: string; value: number | null }[],
): { weekStart: string; value: number | null }[] {
  const byWeek = new Map<string, number[]>();
  for (const p of points) {
    if (p.value === null) continue;
    const d = new Date(p.date + 'T12:00:00Z');
    const day = (d.getUTCDay() + 6) % 7; // lundi = 0
    const monday = new Date(d.getTime() - day * 86400000);
    const key = monday.toISOString().slice(0, 10);
    if (!byWeek.has(key)) byWeek.set(key, []);
    byWeek.get(key)!.push(p.value);
  }
  return [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, vals]) => ({
      weekStart,
      value: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
    }));
}

/** Volume total d'une séance = Σ charge × répétitions (séries terminées). */
export function sessionVolume(session: Session): number {
  let v = 0;
  for (const ex of session.exercices) {
    for (const s of ex.sets) {
      if (s.terminee && s.chargeKg != null && s.repetitions != null) {
        v += s.chargeKg * s.repetitions;
      }
    }
  }
  return v;
}

/** Progression d'un exercice : meilleure charge par date. */
export function exerciseProgress(
  sessions: Session[],
  exercice: string,
): { date: string; chargeKg: number; repetitions: number | null }[] {
  const out: { date: string; chargeKg: number; repetitions: number | null }[] = [];
  for (const s of [...sessions].sort((a, b) => a.date.localeCompare(b.date))) {
    const ex = s.exercices.find((e) => e.exercice === exercice);
    if (!ex) continue;
    const done = ex.sets.filter((x) => x.terminee && x.chargeKg != null);
    if (done.length) {
      const best = done.reduce((a, b) => ((b.chargeKg ?? 0) > (a.chargeKg ?? 0) ? b : a));
      out.push({ date: s.date, chargeKg: best.chargeKg!, repetitions: best.repetitions });
    }
  }
  return out;
}
