import { DEFAULT_TIMEZONE } from './constants.js';

// ------------------------------------------------------------------
// Utilitaires de date — le jour calendaire est toujours évalué dans le
// fuseau Europe/Paris (configurable via les paramètres utilisateur).
// Utilise l'API Intl native : aucune dépendance externe.
// ------------------------------------------------------------------

/** Retourne la date du jour au format YYYY-MM-DD dans le fuseau donné. */
export function todayInTimezone(timezone: string = DEFAULT_TIMEZONE, now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA produit directement le format YYYY-MM-DD
  return fmt.format(now);
}

/** Convertit une date JS/ISO en YYYY-MM-DD dans le fuseau donné. */
export function toDateKey(date: Date, timezone: string = DEFAULT_TIMEZONE): string {
  return todayInTimezone(timezone, date);
}

/** Parse une date de cellule Google Sheets ("dd/mm/yyyy", Date, ISO) en YYYY-MM-DD. */
export function parseSheetDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // openpyxl / googleapis renvoient parfois des Date en UTC
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  // dd/mm/yyyy
  const fr = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (fr) {
    const [, d, m, y] = fr;
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }
  // yyyy-mm-dd (éventuellement avec heure)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

/** Ajoute n jours à une clé de date YYYY-MM-DD. */
export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
  return dt.toISOString().slice(0, 10);
}

/** Liste des n derniers jours (inclus) jusqu'à dateKey, tri asc. */
export function lastNDays(dateKey: string, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(dateKey, -i));
  return out;
}
