// Stockage des photos de progression — fichiers sur disque (data/photos/<userId>/),
// métadonnées dans un index JSON par utilisateur.
// Sheets ne stocke pas d'images : les fichiers vivent dans le volume de données.

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { AppError, ERR } from './errors';
import type { Photo } from '@suivi/shared';

const ANGLES = ['face', 'profil', 'profil-droit', 'profil-gauche', 'dos'] as const;
const POSES = ['relache', 'contracte'] as const;
const MAX_BYTES = 20 * 1024 * 1024; // 20 Mo décodés

export class PhotoStore {
  constructor(private baseDir: string) {}

  private dir(userId: string) {
    // userId est un id interne sans caractères spéciaux — sécurisé comme segment de chemin.
    return path.join(this.baseDir, userId);
  }
  private indexFile(userId: string) {
    return path.join(this.dir(userId), 'index.json');
  }

  async list(userId: string): Promise<Photo[]> {
    try {
      const raw = await readFile(this.indexFile(userId), 'utf8');
      const photos = (JSON.parse(raw) as Photo[]).sort((a, b) => b.date.localeCompare(a.date));
      return photos;
    } catch {
      return [];
    }
  }

  async add(userId: string, angle: string, dataUrl: string, date: string, pose?: string): Promise<Photo> {
    if (!ANGLES.includes(angle as (typeof ANGLES)[number])) {
      throw new AppError(400, ERR.VALIDATION, `Angle invalide (attendu : ${ANGLES.join(', ')})`);
    }
    if (pose !== undefined && !POSES.includes(pose as (typeof POSES)[number])) {
      throw new AppError(400, ERR.VALIDATION, `Pose invalide (attendu : ${POSES.join(', ')})`);
    }
    const m = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/.exec(dataUrl);
    if (!m) throw new AppError(400, ERR.VALIDATION, 'Image invalide (JPEG/PNG/WebP data URL attendue)');
    const buf = Buffer.from(m[2]!, 'base64');
    if (buf.length > MAX_BYTES) throw new AppError(413, ERR.VALIDATION, 'Image trop lourde (20 Mo max)');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError(400, ERR.VALIDATION, 'Date invalide (YYYY-MM-DD)');

    const ext = m[1] === 'png' ? 'png' : m[1] === 'webp' ? 'webp' : 'jpg';
    const id = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
    const dir = this.dir(userId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${id}.${ext}`), buf);

    const photos = await this.list(userId);
    const photo: Photo = {
      id,
      angle,
      pose: pose as Photo['pose'],
      date,
      ext,
      createdAt: new Date().toISOString(),
    };
    photos.unshift(photo);
    await writeFile(this.indexFile(userId), JSON.stringify(photos, null, 2));
    return photo;
  }

  async file(userId: string, id: string): Promise<{ filePath: string; ext: string }> {
    const photo = (await this.list(userId)).find((p) => p.id === id);
    if (!photo) throw new AppError(404, ERR.NOT_FOUND, 'Photo introuvable');
    const filePath = path.join(this.dir(userId), `${id}.${photo.ext}`);
    if (!existsSync(filePath)) throw new AppError(404, ERR.NOT_FOUND, 'Fichier photo manquant');
    return { filePath, ext: photo.ext };
  }

  async remove(userId: string, id: string): Promise<void> {
    const photos = await this.list(userId);
    const photo = photos.find((p) => p.id === id);
    if (!photo) throw new AppError(404, ERR.NOT_FOUND, 'Photo introuvable');
    await writeFile(this.indexFile(userId), JSON.stringify(photos.filter((p) => p.id !== id), null, 2));
    await rm(path.join(this.dir(userId), `${id}.${photo.ext}`), { force: true });
  }
}
