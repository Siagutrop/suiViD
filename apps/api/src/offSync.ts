// ------------------------------------------------------------------
// Synchronisation Open Food Facts → copie locale SQLite.
// Télécharge le dump NDJSON gzippé (~4-5 Go), filtre les produits
// vendus en France avec nutriments complets, et les insère dans
// `off_products` (+ index FTS). Appelé en tâche de fond : jamais
// bloquant pour l'API.
//   - auto au démarrage si la copie a plus de 48 h (OFF_SYNC=off pour couper)
//   - manuel : `npm run import-off -w apps/api` (OFF_IMPORT_MAX pour tester)
// ------------------------------------------------------------------

import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import type { OffDbStore, OffProductRow } from './offDb.js';

const DUMP_URL = 'https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz';
const SYNC_INTERVAL_MS = 48 * 3600_000;
const UA = 'SuiViD/0.2 (application de suivi nutritionnel)';

let running = false;

function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0;
}

function kcal100(n: Record<string, unknown>): number | null {
  const kcal = num(n['energy-kcal_100g']);
  if (kcal) return kcal;
  const kj = num(n['energy_100g']) || num(n['energy-kj_100g']);
  return kj ? Math.round(kj > 500 ? kj / 4.184 : kj) : null;
}

const FR_TAGS = new Set(['en:france', 'fr:france', 'france']);

function parseLine(line: string): OffProductRow | null {
  let p: {
    code?: string;
    product_name?: string;
    product_name_fr?: string;
    brands?: string;
    unique_scans_n?: number;
    countries_tags?: string[];
    nutriments?: Record<string, unknown>;
  };
  try {
    p = JSON.parse(line);
  } catch {
    return null;
  }
  if (!p.code) return null;
  if (!p.countries_tags?.some((t) => FR_TAGS.has(t.toLowerCase()))) return null;
  const nom = (p.product_name_fr ?? p.product_name ?? '').trim();
  if (!nom) return null;
  const n = p.nutriments ?? {};
  const kcal = kcal100(n);
  if (kcal == null) return null;
  const proteines = num(n.proteins_100g);
  const glucides = num(n.carbohydrates_100g);
  const lipides = num(n.fat_100g);
  return {
    code: p.code,
    nom,
    marque: (p.brands ?? '').split(',')[0]?.trim() || null,
    kcal: Math.round(kcal),
    proteines: Math.round(proteines * 10) / 10,
    glucides: Math.round(glucides * 10) / 10,
    lipides: Math.round(lipides * 10) / 10,
    scans: num(p.unique_scans_n),
  };
}

/** Télécharge (ou lit un fichier local) et remplace le catalogue local.
 *  `opts.file` : dump .jsonl.gz téléchargé à la main — plus fiable pour 4-5 Go.
 *  `opts.max` borne pour les tests. */
export async function syncOff(
  store: OffDbStore,
  opts: { max?: number; file?: string } = {},
): Promise<{ imported: number }> {
  let stream: Readable;
  if (opts.file) {
    stream = createReadStream(opts.file).pipe(createGunzip());
  } else {
    // Timeout uniquement sur l'attente des en-têtes : le corps fait ~4-5 Go.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new Error('Réponse OFF trop lente')), 30_000);
    const res = await fetch(DUMP_URL, { headers: { 'User-Agent': UA }, signal: ac.signal });
    clearTimeout(timer);
    if (!res.ok || !res.body) throw new Error(`Téléchargement OFF impossible (HTTP ${res.status})`);
    stream = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream).pipe(createGunzip());
  }
  let streamErr: Error | null = null;
  stream.on('error', (e) => {
    streamErr = e instanceof Error ? e : new Error(String(e));
  });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  store.beginImport();
  let scanned = 0;
  let imported = 0;
  let batch: OffProductRow[] = [];

  const flush = () => {
    if (!batch.length) return;
    store.insertChunk(batch);
    imported += batch.length;
    batch = [];
    if (imported % 100_000 < 20_000) console.log(`[off] ${imported} produits importés…`);
  };

  try {
    for await (const line of rl) {
      scanned++;
      const row = parseLine(line);
      if (row) {
        batch.push(row);
        if (batch.length >= 20_000) flush();
      }
      if (opts.max && scanned >= opts.max) break;
    }
    flush();
  } finally {
    rl.close();
    stream.destroy();
  }
  if (streamErr) throw streamErr;
  if (imported === 0) throw new Error('Aucun produit importé — synchro annulée, copie existante conservée');

  store.commitImport(imported);
  console.log(`[off] synchronisation terminée : ${imported} produits France (${scanned} lignes lues)`);
  return { imported };
}

// ------------------------------------------------------------------
// Exports delta : OFF publie un diff par ~24 h (json.gz par produit
// modifié). Bien plus léger que de re-télécharger 13 Go à chaque maj.
// index.txt liste les fichiers du plus récent au plus ancien.
// ------------------------------------------------------------------
const DELTA_INDEX = 'https://static.openfoodfacts.org/data/delta/index.txt';
const DELTA_BASE = 'https://static.openfoodfacts.org/data/delta/';

async function deltaFilesSince(sinceMs: number): Promise<string[]> {
  const res = await fetch(DELTA_INDEX, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Index delta OFF inaccessible (HTTP ${res.status})`);
  const text = await res.text();
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => {
      const m = /^openfoodfacts_products_(\d+)_(\d+)\.json\.gz$/.exec(l);
      // On retient le delta si sa fin de période est postérieure à lastSync.
      return m && Number(m[2]) * 1000 > sinceMs;
    });
}

/** Applique les exports delta depuis lastSync. */
export async function syncOffDelta(store: OffDbStore, sinceMs: number): Promise<number> {
  const files = await deltaFilesSince(sinceMs);
  if (!files.length) {
    store.touchMeta();
    return 0;
  }
  // Du plus ancien au plus récent pour appliquer dans l'ordre.
  let applied = 0;
  for (const f of [...files].reverse()) {
    const res = await fetch(DELTA_BASE + f, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) });
    if (!res.ok || !res.body) throw new Error(`Delta ${f} inaccessible (HTTP ${res.status})`);
    const stream = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream).pipe(createGunzip());
    let streamErr: Error | null = null;
    stream.on('error', (e) => {
      streamErr = e instanceof Error ? e : new Error(String(e));
    });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    const batch: { del?: string; row?: OffProductRow }[] = [];
    const flush = () => {
      if (!batch.length) return;
      store.applyDeltaBatch(batch.splice(0));
    };
    try {
      for await (const line of rl) {
        let p: Record<string, unknown>;
        try {
          p = JSON.parse(line as string);
        } catch {
          continue;
        }
        const code = typeof p.code === 'string' ? p.code : null;
        if (!code) continue;
        if (p.deleted === 'on' || p.deleted === true) {
          batch.push({ del: code });
        } else {
          const row = parseLine(line as string);
          if (row) batch.push({ row });
        }
        if (batch.length >= 5_000) flush();
      }
      flush();
    } finally {
      rl.close();
      stream.destroy();
    }
    if (streamErr) throw streamErr;
    applied++;
    console.log(`[off] delta ${f} appliqué`);
  }
  store.touchMeta();
  return applied;
}

/** Lance une synchro en tâche de fond si la copie est vieille de + de 48 h.
 *  Ne se déclenche QUE si une copie existe déjà (seedée manuellement via
 *  `npm run import-off <fichier>`) : le dump complet fait ~13 Go, on ne le
 *  télécharge jamais automatiquement — seuls les deltas (~jour de diffs)
 *  sont récupérés. */
export function maybeAutoSync(store: OffDbStore): void {
  if (running) return;
  const { lastSync, count } = store.meta();
  if (count === 0) return; // pas de copie → recherche live uniquement
  const stale = !lastSync || Date.now() - new Date(lastSync).getTime() > SYNC_INTERVAL_MS;
  if (!stale) return;
  running = true;
  console.log('[off] copie > 48 h — application des deltas…');
  void syncOffDelta(store, new Date(lastSync!).getTime())
    .catch((e) => console.warn('[off] synchronisation delta échouée :', e instanceof Error ? e.message : e))
    .finally(() => {
      running = false;
    });
}
