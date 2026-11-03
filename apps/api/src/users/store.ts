import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Env } from '../env.js';
import { AppError, ERR } from '../errors.js';

// ------------------------------------------------------------------
// Stockage des comptes utilisateurs — fichier JSON local.
// Pas de SQL : le volume Docker /data (ou ./data en dev) le persiste.
// Les mots de passe sont hachés scrypt + sel, jamais en clair.
// ------------------------------------------------------------------

export interface UserRecord {
  id: string;
  email: string;
  /** scrypt$N$r$p$saltHex$hashHex */
  passwordHash: string;
  spreadsheetId: string | null;
  /** 'user' (client) ou 'coach' (admin). Défaut 'user' pour les anciens comptes. */
  role: 'user' | 'coach';
  /** Compte désactivé par le coach — connexion et jetons refusés. */
  disabled?: boolean;
  createdAt: string;
}

interface UsersFile {
  users: UserRecord[];
}

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(stored: string, password: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltHex, hashHex] = parts;
  const expected = Buffer.from(hashHex!, 'hex');
  try {
    const actual = scryptSync(password, Buffer.from(saltHex!, 'hex'), expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Chemin par défaut : <repo>/data/users.json (overridable via USERS_FILE). */
export function defaultUsersFile(): string {
  const cwd = process.cwd();
  // Lancé depuis apps/api → la racine du repo est deux niveaux au-dessus.
  if (existsSync(resolve(cwd, '../../package.json'))) {
    return resolve(cwd, '../../data/users.json');
  }
  // Lancé depuis la racine ou le bundle → ./data.
  const viaCwd = resolve(cwd, 'data/users.json');
  if (existsSync(viaCwd) || existsSync(resolve(cwd, 'package.json'))) return viaCwd;
  // Repli : relatif au module (src → racine = 4 niveaux).
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return resolve(moduleDir, '../../../../data/users.json');
}

export const DEMO_USER_EMAIL = 'demo@suivid.app';
export const DEMO_USER_PASSWORD = 'dev';

export class UserStore {
  private file: string;
  private memoryOnly: boolean;
  private users = new Map<string, UserRecord>();
  private queue: Promise<void> = Promise.resolve();

  constructor(env: Env) {
    this.file = env.USERS_FILE ?? defaultUsersFile();
    this.memoryOnly = this.file === ':memory:';
    if (!this.memoryOnly) this.load();
  }

  private load() {
    if (!existsSync(this.file)) return;
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf-8')) as UsersFile;
      for (const u of data.users ?? []) this.users.set(u.id, { ...u, role: u.role ?? 'user' });
    } catch {
      // Fichier corrompu : on repart vide plutôt que de crasher.
    }
  }

  private save(): Promise<void> {
    if (this.memoryOnly) return Promise.resolve();
    // Écritures sérialisées + fichier temporaire puis rename (atomique).
    this.queue = this.queue.then(() => {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      const data: UsersFile = { users: [...this.users.values()] };
      writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
      renameSync(tmp, this.file);
    });
    return this.queue;
  }

  list(): UserRecord[] {
    return [...this.users.values()];
  }

  byId(id: string): UserRecord | undefined {
    return this.users.get(id);
  }

  byEmail(email: string): UserRecord | undefined {
    const e = email.trim().toLowerCase();
    for (const u of this.users.values()) if (u.email === e) return u;
    return undefined;
  }

  create(email: string, password: string, role: 'user' | 'coach' = 'user'): UserRecord {
    const e = email.trim().toLowerCase();
    if (this.byEmail(e)) {
      throw new AppError(409, ERR.VALIDATION, 'Un compte existe déjà avec cet e-mail');
    }
    const user: UserRecord = {
      id: `u_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      email: e,
      passwordHash: hashPassword(password),
      spreadsheetId: null,
      role,
      createdAt: new Date().toISOString(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async update(id: string, patch: { disabled?: boolean; role?: 'user' | 'coach' }): Promise<UserRecord> {
    const u = this.users.get(id);
    if (!u) throw new AppError(404, ERR.NOT_FOUND, 'Utilisateur introuvable');
    if (patch.disabled !== undefined) u.disabled = patch.disabled;
    if (patch.role !== undefined) u.role = patch.role;
    await this.save();
    return u;
  }

  async setPassword(id: string, password: string): Promise<void> {
    const u = this.users.get(id);
    if (!u) throw new AppError(404, ERR.NOT_FOUND, 'Utilisateur introuvable');
    u.passwordHash = hashPassword(password);
    await this.save();
  }

  async setSpreadsheet(userId: string, spreadsheetId: string): Promise<UserRecord> {
    const u = this.users.get(userId);
    if (!u) throw new AppError(404, ERR.NOT_FOUND, 'Utilisateur introuvable');
    u.spreadsheetId = spreadsheetId;
    await this.save();
    return u;
  }

  async persist(): Promise<void> {
    await this.save();
  }
}
