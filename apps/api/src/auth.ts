import { SignJWT, jwtVerify } from 'jose';
import type { Env } from './env.js';
import { AppError, ERR } from './errors.js';
import { UserStore, verifyPassword } from './users/store.js';
import type { UserRecord } from './users/store.js';

// ------------------------------------------------------------------
// Authentification multi-utilisateur : comptes email + mot de passe
// (hash scrypt dans users.json) -> jeton de session signé (JWT HS256,
// sub = userId). Rate limiting en mémoire sur login/signup.
// ------------------------------------------------------------------

interface RateBucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 5 * 60_000;
const MAX_ATTEMPTS = 10;

export class AuthService {
  private secret: Uint8Array;
  private ttl: number;
  private buckets = new Map<string, RateBucket>();

  constructor(
    private env: Env,
    private users: UserStore,
  ) {
    this.secret = new TextEncoder().encode(env.AUTH_SECRET);
    this.ttl = env.SESSION_TTL_SECONDS;
  }

  private rateLimit(key: string) {
    const now = Date.now();
    const b = this.buckets.get(key);
    if (b && now < b.resetAt && b.count >= MAX_ATTEMPTS) {
      throw new AppError(429, ERR.VALIDATION, 'Trop de tentatives — réessayez dans quelques minutes');
    }
    if (!b || now >= b.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    } else {
      b.count++;
    }
    if (this.buckets.size > 5000) this.buckets.clear();
  }

  /** Création de compte (désactivable via ALLOW_SIGNUP=false). */
  async signup(email: string, password: string, ip = 'anon'): Promise<{ token: string; expiresIn: number; user: UserRecord }> {
    this.rateLimit(`signup:${ip}`);
    if (!this.env.ALLOW_SIGNUP) {
      throw new AppError(403, ERR.VALIDATION, 'La création de compte est désactivée sur cette instance');
    }
    const user = this.users.create(email, password);
    await this.users.persist();
    return { ...(await this.issueToken(user.id)), user };
  }

  async login(email: string, password: string, ip = 'anon'): Promise<{ token: string; expiresIn: number; user: UserRecord }> {
    this.rateLimit(`login:${ip}:${email.trim().toLowerCase()}`);
    const user = this.users.byEmail(email);
    if (!user || !verifyPassword(user.passwordHash, password)) {
      throw new AppError(401, ERR.UNAUTHORIZED, 'E-mail ou mot de passe incorrect');
    }
    if (user.disabled) {
      throw new AppError(403, ERR.UNAUTHORIZED, 'Compte désactivé — contacte ton coach');
    }
    return { ...(await this.issueToken(user.id)), user };
  }

  private async issueToken(userId: string): Promise<{ token: string; expiresIn: number }> {
    const token = await new SignJWT({ sub: userId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${this.ttl}s`)
      .sign(this.secret);
    return { token, expiresIn: this.ttl };
  }

  /** Valide le jeton Bearer d'une requête, retourne l'userId. */
  async verify(authorization?: string): Promise<string> {
    if (!authorization?.startsWith('Bearer ')) {
      throw new AppError(401, ERR.UNAUTHORIZED, 'Authentification requise');
    }
    try {
      const { payload } = await jwtVerify(authorization.slice(7), this.secret);
      const u = typeof payload.sub === 'string' ? this.users.byId(payload.sub) : undefined;
      if (!u || u.disabled) throw new Error('unknown user');
      return payload.sub!;
    } catch {
      throw new AppError(401, ERR.UNAUTHORIZED, 'Session expirée, reconnectez-vous');
    }
  }
}
