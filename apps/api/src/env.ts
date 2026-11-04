import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';

const envSchema = z.object({
  DATA_MODE: z.enum(['mock', 'sheets', 'sqlite']).default('mock'),
  /** Fichier SQLite applicatif (défaut : <repo>/data/suivid.db). */
  DB_FILE: z.string().optional(),
  AUTH_SECRET: z.string().min(8).default('dev-secret-change-me-in-production!!'),
  /** Création de compte ouverte (true) ou désactivée (false). */
  ALLOW_SIGNUP: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  /** Fichier JSON des comptes utilisateurs (multi-user). */
  USERS_FILE: z.string().optional(),
  /** Mot de passe du compte démo créé si la base est vide (défaut : "dev"). */
  DEMO_PASSWORD: z.string().min(4).optional(),
  /** Compte coach créé au démarrage si défini et absent (rôle admin). */
  COACH_EMAIL: z.string().email().optional(),
  COACH_PASSWORD: z.string().min(4).optional(),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /** Dossier du build web à servir en statique (déploiement tout-en-un). */
  WEB_DIST: z.string().optional(),

  GOOGLE_SPREADSHEET_ID: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_FILE: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REFRESH_TOKEN: z.string().optional(),

  /** Fichier de persistance locale du mode mock (jamais synchronisé). */
  MOCK_STORE_FILE: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Charge `.env.development` à la racine du repo si présent (dev local).
 * Node ≥ 20.12 fournit process.loadEnvFile ; ignoré silencieusement sinon.
 */
function loadDotenvFile() {
  if (typeof process.loadEnvFile !== 'function') return;
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(moduleDir, '../../../.env.development'), // apps/api/src|dist -> racine
    resolve(process.cwd(), '.env.development'), // lancement depuis la racine
    resolve(process.cwd(), '../../.env.development'), // lancement depuis apps/api
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      process.loadEnvFile(file);
      return;
    } catch {
      // Fichier illisible : les défauts du schéma s'appliquent.
    }
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  loadDotenvFile();
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuration invalide :\n${issues}`);
  }
  const env = parsed.data;

  if (env.DATA_MODE === 'sheets') {
    const missing: string[] = [];
    // GOOGLE_SPREADSHEET_ID optionnel : en multi-user, chaque compte
    // lie son propre classeur ; l'ID global n'est qu'un repli par défaut.
    const hasServiceAccount =
      env.GOOGLE_SERVICE_ACCOUNT_FILE ||
      env.GOOGLE_SERVICE_ACCOUNT_JSON ||
      (env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
    const hasOAuth =
      env.GOOGLE_OAUTH_CLIENT_ID &&
      env.GOOGLE_OAUTH_CLIENT_SECRET &&
      env.GOOGLE_OAUTH_REFRESH_TOKEN;
    if (!hasServiceAccount && !hasOAuth) {
      missing.push(
        'identifiants Google (GOOGLE_SERVICE_ACCOUNT_* ou GOOGLE_OAUTH_*)',
      );
    }
    if (missing.length) {
      throw new Error(
        `DATA_MODE=sheets mais il manque : ${missing.join(', ')}.\n` +
          'Voir docs/GOOGLE_SHEETS.md pour la configuration.',
      );
    }
  }

  return env;
}
