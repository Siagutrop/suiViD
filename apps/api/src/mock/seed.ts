import {
  addDays,
  SHEET_BILAN,
  SHEET_FULL_BODY,
  SHEET_LISTE,
  SHEET_PARAMETRES,
  SHEET_PROGRAMMES,
  SHEET_PROGRAMME_EXERCICES,
  SHEET_SEANCES,
  SHEET_SEANCE_SERIES,
  SHEET_SUIVI,
  todayInTimezone,
} from '@suivi/shared';
import type { CellValue } from '../providers/DataProvider.js';
import fixture from './fixture.json' with { type: 'json' };

// ------------------------------------------------------------------
// Construction du classeur de démonstration.
// Les onglets Liste et Full body reprennent les données de référence du
// fichier réel (exercices, programme). Le journal, les séances et les
// paramètres sont des DONNÉES FICTIVES de démonstration — affichées
// sous bannière « Mode démo » dans l'interface et jamais synchronisées.
// ------------------------------------------------------------------

/** PRNG déterministe pour une démo stable entre les redémarrages. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export interface FixtureExercise {
  nom: string;
  muscle: string | null;
  videoUrl: string | null;
}
export interface FixtureProgramExercise {
  exercice: string;
  variante: string | null;
  series: number;
}

export const FIXTURE = fixture as unknown as {
  exercises: FixtureExercise[];
  fullBodyGrid: (string | null)[][];
  fullBodyProgram: FixtureProgramExercise[];
};

export const DEMO_PROGRAM_ID = 'prog_fullbody';

/** Construit la grille complète du mode démo, centrée sur la date du jour. */
export function buildMockGrid(today: string = todayInTimezone()): Record<string, CellValue[][]> {
  const rand = mulberry32(20261102);

  // ----- Suivi : en-têtes + lignes J-35 .. J+30 -----
  const suivi: CellValue[][] = [
    [
      'Date',
      'N°Semaine',
      'Sommeil en heure',
      'Forme du jour (1 à 10)',
      'Poids en kg',
      'Total calorie (kcal)',
      'Glucides',
      'Protéines',
      'Lipides',
      'Pas',
      'Entraînement',
    ],
  ];
  const isoWeek = (dateKey: string) => {
    const d = new Date(dateKey + 'T12:00:00Z');
    const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNr = (target.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNr + 3);
    const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
    const fDay = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - fDay + 3);
    return 1 + Math.round((target.getTime() - firstThursday.getTime()) / 604800000);
  };

  for (let i = -35; i <= 30; i++) {
    const dateKey = addDays(today, i);
    const [y, m, d] = dateKey.split('-').map(Number);
    const row: CellValue[] = [`${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`, isoWeek(dateKey)];
    if (i < 0) {
      // Jours passés : données fictives plausibles avec quelques trous.
      const hasData = rand() > 0.15;
      const trained = rand() > 0.55;
      row.push(
        hasData ? round(6 + rand() * 2.5) : '-',
        hasData ? Math.round(4 + rand() * 5) : '-',
        hasData ? round(78.5 - i * 0.02 + rand() * 0.8) : '-',
        hasData ? Math.round(2100 + rand() * 700) : '-',
        hasData ? Math.round(180 + rand() * 120) : '-',
        hasData ? Math.round(140 + rand() * 60) : '-',
        hasData ? Math.round(60 + rand() * 40) : '-',
        hasData ? Math.round(4000 + rand() * 8000) : '-',
        trained ? 'Full body' : '-',
      );
    }
    suivi.push(row);
  }

  // ----- Liste : réplique exacte de l'onglet réel -----
  const liste: CellValue[][] = [['Nom', 'Muscle', 'Lien vidéo']];
  for (const e of FIXTURE.exercises) liste.push([e.nom, e.muscle, e.videoUrl]);

  // ----- Programmes : import normalisé du modèle « Full body » -----
  const programmes: CellValue[][] = [
    ['id', 'nom', 'statut', 'cree_le', 'note'],
    [DEMO_PROGRAM_ID, 'Full body', 'actif', today, 'Importé depuis l’onglet Full body (démo)'],
  ];
  const progExos: CellValue[][] = [
    ['programme_id', 'ordre', 'exercice', 'series', 'repetitions_cible', 'variante', 'notes', 'repos_sec'],
  ];
  FIXTURE.fullBodyProgram.forEach((p, i) => {
    // Démo : repos long sur les gros mouvements, défaut ailleurs.
    const repos = i < 2 ? 120 : null;
    progExos.push([DEMO_PROGRAM_ID, i + 1, p.exercice, p.series, '8-12', p.variante, null, repos]);
  });

  // ----- Séances : 3 séances fictives récentes -----
  const seances: CellValue[][] = [
    ['id', 'date', 'programme_id', 'programme_nom', 'debut', 'fin', 'duree_sec', 'statut', 'notes'],
  ];
  const seanceSeries: CellValue[][] = [
    ['seance_id', 'exercice', 'ordre_exercice', 'serie', 'charge_kg', 'repetitions', 'terminee', 'notes'],
  ];
  const daysOfSessions = [-1, -4, -7];
  daysOfSessions.forEach((offset, sIdx) => {
    const sid = `demo_seance_${sIdx + 1}`;
    const date = addDays(today, offset);
    const debut = `${date}T18:00:00+01:00`;
    const fin = `${date}T19:10:00+01:00`;
    seances.push([sid, date, DEMO_PROGRAM_ID, 'Full body', debut, fin, 4200, 'terminee', null]);
    FIXTURE.fullBodyProgram.forEach((p, exIdx) => {
      const charge = round(20 + exIdx * 8 + sIdx * 2 + rand() * 5, 1);
      for (let s = 1; s <= p.series; s++) {
        seanceSeries.push([sid, p.exercice, exIdx + 1, s, charge, Math.round(8 + rand() * 4), true, null]);
      }
    });
  });

  // ----- Paramètres de démonstration -----
  const parametres: CellValue[][] = [
    ['cle', 'valeur'],
    ['objectifPoids', '76'],
    ['objectifCalories', '2400'],
    ['objectifProteines', '170'],
    ['objectifGlucides', '250'],
    ['objectifLipides', '80'],
    ['objectifPas', '8000'],
    ['poidsDepart', '80.5'],
    ['reposDefautSec', '90'],
    ['timezone', 'Europe/Paris'],
  ];

  return {
    [SHEET_SUIVI]: suivi,
    [SHEET_LISTE]: liste,
    [SHEET_FULL_BODY]: FIXTURE.fullBodyGrid as CellValue[][],
    [SHEET_BILAN]: [],
    [SHEET_PROGRAMMES]: programmes,
    [SHEET_PROGRAMME_EXERCICES]: progExos,
    [SHEET_SEANCES]: seances,
    [SHEET_SEANCE_SERIES]: seanceSeries,
    [SHEET_PARAMETRES]: parametres,
  };
}
