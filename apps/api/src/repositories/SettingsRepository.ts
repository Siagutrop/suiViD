import {
  DEFAULT_SETTINGS,
  DEFAULT_TIMEZONE,
  SHEET_PARAMETRES,
  type UserSettings,
} from '@suivi/shared';
import { AppError, ERR } from '../errors.js';
import type { DataProvider } from '../providers/DataProvider.js';
import { toText } from './cells.js';

// ------------------------------------------------------------------
// Onglet Parametres : cle | valeur (une ligne par paramètre).
// Lecture : fusion avec les valeurs par défaut.
// Écriture : réécriture du bloc clé/valeur (petit volume, append si
// nouvelles clés). Aucune autre colonne n'est touchée.
// ------------------------------------------------------------------

const NUMERIC_KEYS = new Set([
  'objectifPoids',
  'objectifCalories',
  'objectifProteines',
  'objectifGlucides',
  'objectifLipides',
  'objectifPas',
  'poidsDepart',
  'reposDefautSec',
]);

export class SettingsRepository {
  constructor(private readonly provider: DataProvider) {}

  private async ensureTab() {
    const tabs = await this.provider.listSheets();
    if (!tabs.includes(SHEET_PARAMETRES)) {
      throw new AppError(
        409,
        ERR.TABS_MISSING,
        `Onglet « ${SHEET_PARAMETRES} » manquant. Exécutez le provisionnement.`,
      );
    }
  }

  async get(): Promise<UserSettings> {
    let map = new Map<string, string>();
    const tabs = await this.provider.listSheets();
    if (tabs.includes(SHEET_PARAMETRES)) {
      const grid = await this.provider.getRange(SHEET_PARAMETRES, 'A2:B200');
      map = new Map(
        grid
          .map((r) => [toText(r[0]), toText(r[1])] as const)
          .filter((x): x is [string, string] => x[0] !== null && x[1] !== null),
      );
    }
    const num = (k: string): number | null => {
      const v = map.get(k);
      if (v == null || v === '') return null;
      const n = Number(v.replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    };
    const d = DEFAULT_SETTINGS;
    return {
      objectifPoids: num('objectifPoids'),
      objectifCalories: num('objectifCalories'),
      objectifProteines: num('objectifProteines'),
      objectifGlucides: num('objectifGlucides'),
      objectifLipides: num('objectifLipides'),
      objectifPas: num('objectifPas'),
      poidsDepart: num('poidsDepart'),
      reposDefautSec: num('reposDefautSec') ?? d.reposDefautSec,
      unite: 'kg',
      timezone: map.get('timezone') ?? d.timezone ?? DEFAULT_TIMEZONE,
    };
  }

  /** Persiste les paramètres : upsert clé par clé puis réécriture du bloc. */
  async update(settings: UserSettings): Promise<UserSettings> {
    await this.ensureTab();
    const entries: [string, string][] = (
      Object.entries(settings) as [keyof UserSettings, unknown][]
    ).map(([k, v]) => [k as string, v == null ? '' : String(v)]);
    const values = [['cle', 'valeur'], ...entries];
    await this.provider.updateRange(
      SHEET_PARAMETRES,
      `A1:B${values.length}`,
      values,
    );
    return this.get();
  }
}
