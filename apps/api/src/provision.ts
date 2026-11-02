import {
  REQUIRED_NEW_TABS,
  SHEET_FULL_BODY,
  SHEET_LISTE,
  SHEET_PARAMETRES,
  SHEET_SUIVI,
  addDays,
  todayInTimezone,
} from '@suivi/shared';
import type { DataProvider } from './providers/DataProvider.js';
import { ProgramRepository } from './repositories/ProgramRepository.js';
import { FIXTURE, DEMO_PROGRAM_ID } from './mock/seed.js';
import type { CellValue } from './providers/DataProvider.js';

// ------------------------------------------------------------------
// Provisionnement d'un classeur utilisateur.
// Crée les onglets applicatifs manquants et, si le classeur est vide,
// y dépose la structure complète (Suivi + dates, Liste des 92
// exercices de référence, modèle Full body, Paramètres par défaut).
// Jamais exécuté automatiquement — uniquement à la liaison explicite
// d'un classeur ou via la route admin.
// ------------------------------------------------------------------

const HEADERS: Record<string, string[]> = {
  Suivi: [
    'Date', 'N°Semaine', 'Sommeil en heure', 'Forme du jour (1 à 10)', 'Poids en kg',
    'Total calorie (kcal)', 'Glucides', 'Protéines', 'Lipides', 'Pas', 'Entraînement',
  ],
  Liste: ['Nom', 'Muscle', 'Lien vidéo'],
  Programmes: ['id', 'nom', 'statut', 'cree_le', 'note'],
  ProgrammeExercices: ['programme_id', 'ordre', 'exercice', 'series', 'repetitions_cible', 'variante', 'notes', 'repos_sec'],
  Seances: ['id', 'date', 'programme_id', 'programme_nom', 'debut', 'fin', 'duree_sec', 'statut', 'notes'],
  SeanceSeries: ['seance_id', 'exercice', 'ordre_exercice', 'serie', 'charge_kg', 'repetitions', 'terminee', 'notes'],
  Parametres: ['cle', 'valeur'],
};

const DEFAULT_PARAMETRES: CellValue[][] = [
  ['objectifPoids', ''],
  ['objectifCalories', '2400'],
  ['objectifProteines', '170'],
  ['objectifGlucides', '250'],
  ['objectifLipides', '80'],
  ['objectifPas', '8000'],
  ['poidsDepart', ''],
  ['reposDefautSec', '90'],
  ['timezone', 'Europe/Paris'],
];

/** Numéro de semaine ISO-8601 (comme la colonne B du classeur d'origine). */
function isoWeek(dateKey: string): number {
  const d = new Date(dateKey + 'T12:00:00Z');
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const fDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fDay + 3);
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / 604800000);
}

function suiviDateRows(today: string, before = 30, after = 90): CellValue[][] {
  const rows: CellValue[][] = [];
  for (let i = -before; i <= after; i++) {
    const dk = addDays(today, i);
    const [y, m, d] = dk.split('-').map(Number);
    rows.push([`${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`, isoWeek(dk)]);
  }
  return rows;
}

export interface ProvisionResult {
  created: string[];
  seeded: string[];
  programImported: boolean;
  tabs: string[];
}

export async function provisionSpreadsheet(provider: DataProvider): Promise<ProvisionResult> {
  const created: string[] = [];
  const seeded: string[] = [];
  const wp = provider.writeProvision?.bind(provider);
  if (!wp) throw new Error('Provider sans writeProvision');
  const existing = await provider.listSheets();

  const ensureTab = async (tab: string) => {
    if (!existing.includes(tab)) {
      await provider.createSheet(tab);
      created.push(tab);
    }
  };

  // --- Onglets de référence ---
  await ensureTab(SHEET_SUIVI);
  await ensureTab(SHEET_LISTE);
  await ensureTab(SHEET_FULL_BODY);
  for (const tab of REQUIRED_NEW_TABS) await ensureTab(tab);

  // --- En-têtes systématiques ---
  // Idempotent : ligne 1 vide → écrit tout ; préfixe identique mais
  // colonnes finales manquantes → complète le suffixe seulement
  // (migration douce, ex. repos_sec ajouté après un 1er provisionnement).
  for (const [tab, header] of Object.entries(HEADERS)) {
    const lastCol = String.fromCharCode(64 + header.length);
    const head = await provider.getRange(tab, `A1:${lastCol}1`).catch(() => []);
    const existing = head[0] ?? [];
    const empty = existing.every((c) => c == null || c === '');
    if (empty) {
      await wp(tab, `A1:${lastCol}1`, [header]);
      continue;
    }
    const matchesPrefix = header
      .slice(0, existing.length)
      .every((h, i) => String(existing[i] ?? '').toLowerCase() === h.toLowerCase());
    if (matchesPrefix && existing.length < header.length) {
      const firstNew = String.fromCharCode(65 + existing.length);
      await wp(tab, `${firstNew}1:${lastCol}1`, [header.slice(existing.length)]);
    }
  }

  // --- Suivi : lignes de dates si aucune donnée sous les en-têtes ---
  {
    const dataRows = await provider.getRange(SHEET_SUIVI, 'A2:A3').catch(() => []);
    const hasData = dataRows.some((r) => r.some((c) => c != null && c !== ''));
    if (!hasData) {
      const rows = suiviDateRows(todayInTimezone());
      await wp(SHEET_SUIVI, `A2:B${1 + rows.length}`, rows);
      seeded.push(SHEET_SUIVI);
    }
  }

  // --- Liste : 92 exercices de référence si aucune donnée ---
  {
    const body = await provider.getRange(SHEET_LISTE, 'A2:A3').catch(() => []);
    const hasData = body.some((r) => r.some((c) => c != null && c !== ''));
    if (!hasData) {
      await wp(
        SHEET_LISTE,
        `A2:C${1 + FIXTURE.exercises.length}`,
        FIXTURE.exercises.map((e): CellValue[] => [e.nom, e.muscle, e.videoUrl]),
      );
      seeded.push(SHEET_LISTE);
    }
  }

  // --- Full body : modèle d'origine si vide (référence, jamais modifié ensuite) ---
  {
    const grid = await provider.getRange(SHEET_FULL_BODY, 'A1:J10').catch(() => []);
    const hasData = grid.some((r) => r.some((c) => c != null && c !== ''));
    if (!hasData) {
      const fb = FIXTURE.fullBodyGrid as CellValue[][];
      await wp(SHEET_FULL_BODY, `A1:J${fb.length}`, fb);
      seeded.push(SHEET_FULL_BODY);
    }
  }

  // --- Paramètres par défaut si aucune donnée sous l'en-tête ---
  {
    const body = await provider.getRange(SHEET_PARAMETRES, 'A2:A3').catch(() => []);
    const hasData = body.some((r) => r.some((c) => c != null && c !== ''));
    if (!hasData) {
      await wp(SHEET_PARAMETRES, `A2:B${1 + DEFAULT_PARAMETRES.length}`, DEFAULT_PARAMETRES);
      seeded.push(SHEET_PARAMETRES);
    }
  }

  // --- Programme Full body dans les onglets applicatifs si vide ---
  let programImported = false;
  const progExos = await provider.getRange('ProgrammeExercices', 'A2:A3').catch(() => []);
  const hasProg = progExos.some((r) => r.some((c) => c != null && c !== ''));
  if (!hasProg) {
    const programs = new ProgramRepository(provider);
    const imported = await programs.importFullBodyTemplate();
    if (imported) {
      programImported = true;
    } else {
      // Fallback : données du modèle d'origine si l'onglet n'a pas pu être lu
      await wp('Programmes', 'A2:E2', [[DEMO_PROGRAM_ID, 'Full body', 'actif', todayInTimezone(), 'Modèle de départ']]);
      const rows = FIXTURE.fullBodyProgram.map((p, i) => [
        DEMO_PROGRAM_ID, i + 1, p.exercice, p.series, '8-12', p.variante, '', null,
      ]);
      await wp('ProgrammeExercices', `A2:H${1 + rows.length}`, rows);
      programImported = true;
    }
  }

  return { created, seeded, programImported, tabs: await provider.listSheets() };
}

/** Extrait l'ID d'un classeur depuis une URL ou un ID brut. */
export function parseSpreadsheetId(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/d\/([a-zA-Z0-9-_]{20,60})/) ?? s.match(/^([a-zA-Z0-9-_]{20,60})$/);
  return m?.[1] ?? null;
}
