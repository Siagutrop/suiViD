// ------------------------------------------------------------------
// Sauvegarde de la base SQLite — copies horodatées dans
// <data>/backups/ avec rétention des 10 plus récentes.
// Utilise l'API db.backup() de better-sqlite3 (copie cohérente à chaud,
// sûre même pendant des écritures WAL).
// ------------------------------------------------------------------

import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Db } from './db.js';

const KEEP = 10;
const AUTO_INTERVAL_MS = 20 * 60 * 60 * 1000; // 20 h

export interface BackupInfo {
  fichier: string;
  taille: number;
  date: string;
}

export async function listBackups(dir: string): Promise<BackupInfo[]> {
  try {
    const files = (await readdir(dir)).filter((f) => f.endsWith('.db'));
    const infos = await Promise.all(
      files.map(async (f) => {
        const s = await stat(path.join(dir, f));
        return { fichier: f, taille: s.size, date: s.mtime.toISOString() };
      }),
    );
    return infos.sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

/** Crée une copie de la base puis supprime les plus anciennes au-delà de KEEP. */
export async function backupDb(db: Db, dir: string): Promise<BackupInfo> {
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const fichier = `suivid-${stamp}.db`;
  await db.backup(path.join(dir, fichier));
  const all = await listBackups(dir);
  await Promise.all(all.slice(KEEP).map((b) => rm(path.join(dir, b.fichier), { force: true })));
  return (await listBackups(dir))[0]!;
}

/** Sauvegarde automatique si la dernière date de plus de 20 h (démarrage). */
export async function autoBackup(db: Db, dir: string): Promise<void> {
  const latest = (await listBackups(dir))[0];
  if (latest && Date.now() - new Date(latest.date).getTime() < AUTO_INTERVAL_MS) return;
  await backupDb(db, dir);
}
