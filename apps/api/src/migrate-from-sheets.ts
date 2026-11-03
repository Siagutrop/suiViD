// ------------------------------------------------------------------
// Migration one-shot Google Sheets -> SQLite.
//
//   npx tsx src/migrate-from-sheets.ts <email-utilisateur>
//
// Copie chaque onglet du classeur de l'utilisateur dans son scope
// SQLite (« Liste » va dans le scope global, partagé). Idempotent :
// les cellules sont écrasées à l'identique, les onglets créés au besoin.
// ------------------------------------------------------------------

import { loadEnv } from './env.js';
import { UserStore } from './users/store.js';
import { SheetsProvider } from './providers/SheetsProvider.js';
import { openDb, defaultDbFile } from './db.js';
import { SqliteProvider } from './providers/SqliteProvider.js';

const email = process.argv[2];
if (!email) {
  console.error('Usage : npx tsx src/migrate-from-sheets.ts <email-utilisateur>');
  process.exit(1);
}

const env = loadEnv();
const users = new UserStore(env);
const user = users.byEmail(email);
if (!user) {
  console.error(`Utilisateur introuvable : ${email}`);
  process.exit(1);
}
if (!user.spreadsheetId || user.spreadsheetId === 'sqlite' || user.spreadsheetId === 'demo') {
  console.error(`Pas de classeur Google lié pour ${email} (spreadsheetId=${user.spreadsheetId})`);
  process.exit(1);
}

const source = new SheetsProvider(env, user.spreadsheetId);
const db = openDb(env.DB_FILE ?? defaultDbFile());
const target = new SqliteProvider(db, user.id);

const tabs = await source.listSheets();
console.log(`Classeur ${user.spreadsheetId} — ${tabs.length} onglets : ${tabs.join(', ')}`);

for (const tab of tabs) {
  const grid = await source.getRange(tab, 'A1:AZ5000');
  // Supprime les lignes/colonnes de fin entièrement vides pour ne pas
  // stocker des milliers de cellules nulles.
  let lastRow = grid.length;
  while (lastRow > 0 && grid[lastRow - 1]!.every((c) => c == null || c === '')) lastRow--;
  const trimmed = grid.slice(0, lastRow).map((row) => {
    let lastCol = row.length;
    while (lastCol > 0 && (row[lastCol - 1] == null || row[lastCol - 1] === '')) lastCol--;
    return row.slice(0, lastCol);
  });
  await target.createSheet(tab);
  if (trimmed.length) {
    await target.writeProvision!(tab, 'A1', trimmed);
  }
  console.log(`  ${tab} : ${trimmed.length} lignes copiées`);
}

console.log('Migration terminée.');
process.exit(0);
