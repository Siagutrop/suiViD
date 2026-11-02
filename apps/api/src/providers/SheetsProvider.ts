import { google, type sheets_v4 } from 'googleapis';
import { existsSync, readFileSync } from 'node:fs';
import { WRITABLE_SHEETS } from '@suivi/shared';
import { AppError, ERR } from '../errors.js';
import type { Env } from '../env.js';
import { quoteSheet } from './a1.js';
import type { CellValue, DataProvider, Grid, RangeUpdate } from './DataProvider.js';

const WRITABLE = new Set<string>(WRITABLE_SHEETS);
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

function buildAuth(env: Env) {
  // Option 1 : compte de service
  let creds: ServiceAccountKey | undefined;
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    creds = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON) as ServiceAccountKey;
  } else if (env.GOOGLE_SERVICE_ACCOUNT_FILE) {
    creds = JSON.parse(readFileSync(env.GOOGLE_SERVICE_ACCOUNT_FILE, 'utf-8')) as ServiceAccountKey;
  } else if (env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    creds = {
      client_email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  }
  if (creds) {
    return new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: SCOPES,
    });
  }

  // Option 2 : OAuth 2.0 utilisateur (refresh token)
  const oauth = new google.auth.OAuth2(
    env.GOOGLE_OAUTH_CLIENT_ID,
    env.GOOGLE_OAUTH_CLIENT_SECRET,
  );
  oauth.setCredentials({ refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN });
  return oauth;
}

/**
 * Provider Google Sheets API v4.
 * Les écritures sont restreintes à la whitelist WRITABLE_SHEETS ;
 * les règles métier fines (ligne du jour, colonnes C..K) sont appliquées
 * dans les repositories.
 */
/** Email du compte de service configuré (affiché lors de la liaison du classeur). */
export function serviceAccountEmail(env: Env): string | null {
  try {
    if (env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      return (JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON) as ServiceAccountKey).client_email;
    }
    if (env.GOOGLE_SERVICE_ACCOUNT_FILE && existsSync(env.GOOGLE_SERVICE_ACCOUNT_FILE)) {
      return (JSON.parse(readFileSync(env.GOOGLE_SERVICE_ACCOUNT_FILE, 'utf-8')) as ServiceAccountKey)
        .client_email;
    }
    return env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? null;
  } catch {
    return env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? null;
  }
}

export class SheetsProvider implements DataProvider {
  private sheets: sheets_v4.Sheets;
  private spreadsheetId: string;

  constructor(env: Env, spreadsheetId?: string) {
    const auth = buildAuth(env);
    this.sheets = google.sheets({ version: 'v4', auth });
    const id = spreadsheetId ?? env.GOOGLE_SPREADSHEET_ID;
    if (!id) throw new AppError(400, ERR.VALIDATION, 'Aucun classeur lié à ce compte');
    this.spreadsheetId = id;
  }

  private assertWritable(sheet: string) {
    if (!WRITABLE.has(sheet)) {
      throw new AppError(
        403,
        ERR.FORBIDDEN_SHEET,
        `Écriture interdite sur l'onglet « ${sheet} »`,
      );
    }
  }

  private wrap(err: unknown): never {
    const e = err as { code?: number; message?: string; errors?: { message?: string }[] };
    const msg = e?.errors?.[0]?.message ?? e?.message ?? 'Erreur Google API';
    if (e?.code === 404) throw new AppError(404, ERR.NOT_FOUND, `Classeur ou onglet introuvable : ${msg}`);
    if (e?.code === 403) throw new AppError(502, ERR.GOOGLE_API, `Accès refusé par Google Sheets : ${msg}`);
    if (e?.code === 429) throw new AppError(503, ERR.GOOGLE_API, 'Quota Google API atteint, réessayez dans un instant');
    throw new AppError(502, ERR.GOOGLE_API, `Erreur Google Sheets : ${msg}`);
  }

  async listSheets(): Promise<string[]> {
    try {
      const res = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
        fields: 'sheets.properties.title',
      });
      return (res.data.sheets ?? []).map((s) => s.properties?.title ?? '');
    } catch (err) {
      this.wrap(err);
    }
  }

  async getRange(sheet: string, a1: string): Promise<Grid> {
    try {
      const res = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${quoteSheet(sheet)}!${a1}`,
        // Valeurs brutes (nombres natifs) + dates en chaîne formatée dd/mm/yyyy
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING',
      });
      return (res.data.values ?? []) as Grid;
    } catch (err) {
      this.wrap(err);
    }
  }

  async updateRange(sheet: string, a1: string, values: CellValue[][]): Promise<void> {
    this.assertWritable(sheet);
    try {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${quoteSheet(sheet)}!${a1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: values as unknown[][] },
      });
    } catch (err) {
      this.wrap(err);
    }
  }

  async batchUpdate(sheet: string, updates: RangeUpdate[]): Promise<void> {
    this.assertWritable(sheet);
    if (!updates.length) return;
    try {
      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: updates.map((u) => ({
            range: `${quoteSheet(sheet)}!${u.range}`,
            values: u.values as unknown[][],
          })),
        },
      });
    } catch (err) {
      this.wrap(err);
    }
  }

  async appendRows(sheet: string, values: CellValue[][]): Promise<void> {
    this.assertWritable(sheet);
    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${quoteSheet(sheet)}!A1`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: values as unknown[][] },
      });
    } catch (err) {
      this.wrap(err);
    }
  }

  async createSheet(sheet: string): Promise<void> {
    try {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: sheet } } }],
        },
      });
    } catch (err) {
      this.wrap(err);
    }
  }

  /**
   * Écriture réservée au provisionnement d'un classeur NEUF (onglets,
   * en-têtes, données de départ). Contourne la whitelist : n'est appelée
   * que par la logique de provisionnement explicite, jamais par les
   * repositories métier.
   */
  async writeProvision(sheet: string, a1: string, values: CellValue[][]): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${quoteSheet(sheet)}!${a1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: values as unknown[][] },
      });
    } catch (err) {
      this.wrap(err);
    }
  }
}
