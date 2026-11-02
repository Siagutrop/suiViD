import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** ID de vidéo YouTube depuis les URL du fichier (shorts, watch, youtu.be). */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m =
    url.match(/youtube\.com\/shorts\/([\w-]{6,20})/) ??
    url.match(/youtube\.com\/watch\?.*v=([\w-]{6,20})/) ??
    url.match(/youtu\.be\/([\w-]{6,20})/);
  return m?.[1] ?? null;
}

export function youtubeEmbed(url: string | null | undefined): string | null {
  const id = youtubeId(url);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** "lundi 2 novembre" depuis YYYY-MM-DD. */
export function formatDateFr(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  const jour = JOURS[dt.getUTCDay()]!;
  return `${jour} ${d} ${MOIS[m! - 1]}`;
}

/** "02/11" compact. */
export function formatShort(dateKey: string): string {
  const [, m, d] = dateKey.split('-');
  return `${d}/${m}`;
}

export function formatKg(v: number | null | undefined, digits = 1): string {
  if (v == null) return '—';
  return `${v.toFixed(digits).replace('.', ',')} kg`;
}

export function formatNum(v: number | null | undefined, unit = ''): string {
  if (v == null) return '—';
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',');
  return unit ? `${s} ${unit}` : s;
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

export function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Salutation selon l'heure locale. */
export function greeting(hour = new Date().getHours()): string {
  if (hour < 5) return 'Bonne nuit';
  if (hour < 12) return 'Bonjour';
  if (hour < 18) return 'Bon après-midi';
  return 'Bonsoir';
}
