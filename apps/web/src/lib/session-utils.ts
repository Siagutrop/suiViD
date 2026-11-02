import type { Program } from '@suivi/shared';
import { formatShort, formatDuration } from '@/lib/utils';

export { formatShort, formatDuration };

/** Nombre total de séries d'un programme. */
export function sessionCount(p: Program): number {
  return p.exercices.reduce((acc, e) => acc + e.series, 0);
}
