// Import manuel du catalogue Open Food Facts → copie locale SQLite.
//   npx tsx src/offSync.cli.ts                          → import complet (~4-5 Go)
//   npx tsx src/offSync.cli.ts ../../data/dump.jsonl.gz → depuis un fichier téléchargé
//   OFF_IMPORT_MAX=20000 npx tsx src/offSync.cli.ts     → test borné
//
// Fichier à télécharger (navigateur, reprend en cas de coupure) :
//   https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz
// Ou le sous-ensemble France en CSV (bien plus léger) — adapter le parseur si besoin :
//   https://fr.openfoodfacts.org/data/fr.openfoodfacts.org.products.csv

import { openDb, defaultDbFile } from './db.js';
import { OffDbStore } from './offDb.js';
import { syncOff } from './offSync.js';

const file = process.argv[2];
const max = process.env.OFF_IMPORT_MAX ? Number(process.env.OFF_IMPORT_MAX) : undefined;
const db = openDb(process.env.DB_FILE ?? defaultDbFile());
const store = new OffDbStore(db);

console.log(`[off] démarrage de la synchro${file ? ` depuis ${file}` : ''}${max ? ` (borne ${max} lignes)` : ''}…`);
const { imported } = await syncOff(store, { max, file });
console.log(`[off] OK — ${imported} produits dans la copie locale.`);
db.close();
