import type { ApiError } from '@suivi/shared';

/** Erreur applicative avec code métier et statut HTTP. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function toApiError(err: unknown): { status: number; body: ApiError } {
  if (err instanceof AppError) {
    return {
      status: err.statusCode,
      body: { error: err.message, code: err.code, details: err.details },
    };
  }
  const message = err instanceof Error ? err.message : 'Erreur interne';
  return { status: 500, body: { error: message, code: 'INTERNAL' } };
}

// Codes métier utilisés par l'API
export const ERR = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  ROW_MISSING: 'ROW_MISSING', // aucune ligne pour la date du jour
  CONFLICT: 'CONFLICT', // valeurs modifiées par un autre client
  FORBIDDEN_RANGE: 'FORBIDDEN_RANGE', // tentative d'écriture hors plage autorisée
  FORBIDDEN_SHEET: 'FORBIDDEN_SHEET', // tentative d'écriture sur un onglet protégé
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  TABS_MISSING: 'TABS_MISSING', // onglets applicatifs non provisionnés
  GOOGLE_API: 'GOOGLE_API',
} as const;
