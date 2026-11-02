// ------------------------------------------------------------------
// Provisionnement direct d'un classeur Google Sheets (outil admin).
// Usage : DATA_MODE=sheets npm run api:setup-sheets -- <spreadsheetId ou URL>
// Sans argument : utilise GOOGLE_SPREADSHEET_ID de l'environnement.
// Crée les onglets applicatifs manquants et installe la structure de
// départ sur les onglets vides — ne modifie JAMAIS les données
// existantes (Suivi, Liste, Full body conservés tels quels).
// ------------------------------------------------------------------

import { loadEnv } from '../env.js';
import { SheetsProvider } from '../providers/SheetsProvider.js';
import { provisionSpreadsheet, parseSpreadsheetId } from '../provision.js';

async function main() {
  const env = loadEnv();
  if (env.DATA_MODE !== 'sheets') {
    console.log('DATA_MODE != sheets — rien à provisionner (le mock est déjà prêt).');
    return;
  }
  const input = process.argv[2] ?? env.GOOGLE_SPREADSHEET_ID ?? '';
  const id = parseSpreadsheetId(input);
  if (!id) {
    console.error('Identifiant de classeur invalide. Passe l\'URL ou l\'ID en argument.');
    process.exit(1);
  }
  const provider = new SheetsProvider(env, id);
  const result = await provisionSpreadsheet(provider);
  console.log('Onglets créés :', result.created.join(', ') || 'aucun');
  console.log('Données installées :', result.seeded.join(', ') || 'aucune (déjà rempli)');
  console.log('Programme importé :', result.programImported ? 'oui' : 'non');
  console.log('Onglets présents :', result.tabs.join(', '));
}

void main();
