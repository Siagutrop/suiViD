import { randomUUID } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import type { PasskeyRecord } from '@suivi/shared';
import type { Env } from './env.js';
import { AppError, ERR } from './errors.js';
import type { UserRecord } from './users/store.js';

// ------------------------------------------------------------------
// WebAuthn / passkeys — connexion par empreinte, FaceID ou PIN
// d'appareil. Les challenges sont éphémères : stockés en mémoire avec
// un TTL court et consommés une seule fois (anti-rejeu).
//
// rpID : WEBAUTHN_RP_ID, sinon le host du 1er CORS_ORIGIN non '*'.
// Indéterminable (CORS '*' sans WEBAUTHN_RP_ID) -> service désactivé :
// les cérémonies renvoient 400 et le front masque le bouton empreinte.
// Origines attendues : CORS_ORIGIN + l'origine réelle de la requête
// (déploiement tout-en-un où l'API sert aussi le front).
// ------------------------------------------------------------------

const CHALLENGE_TTL_MS = 5 * 60_000;

interface PendingChallenge {
  challenge: string;
  userId: string;
  expiresAt: number;
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

export class WebAuthnService {
  /** rpID résolu, undefined quand la configuration ne permet pas WebAuthn. */
  readonly rpId?: string;
  readonly rpName: string;
  private pending = new Map<string, PendingChallenge>();

  constructor(private env: Env) {
    const cors0 = this.env.CORS_ORIGIN.split(',')
      .map((s) => s.trim())
      .find((s) => s && s !== '*');
    this.rpId = this.env.WEBAUTHN_RP_ID ?? (cors0 ? hostOf(cors0) : undefined);
    this.rpName = this.env.WEBAUTHN_RP_NAME;
  }

  get enabled(): boolean {
    return this.rpId !== undefined;
  }

  private requireRpId(): string {
    if (!this.rpId) {
      throw new AppError(
        400,
        ERR.VALIDATION,
        'Connexion par empreinte non configurée sur ce serveur (WEBAUTHN_RP_ID)',
      );
    }
    return this.rpId;
  }

  private expectedOrigins(req: FastifyRequest): string[] {
    const origin = req.headers.origin;
    const cors = this.env.CORS_ORIGIN.split(',')
      .map((s) => s.trim())
      .filter((s) => s && s !== '*');
    return [...new Set([...cors, ...(origin ? [origin] : [])])];
  }

  private stash(userId: string, challenge: string): string {
    if (this.pending.size > 10_000) this.pending.clear();
    const id = `ch_${randomUUID().replace(/-/g, '')}`;
    this.pending.set(id, { challenge, userId, expiresAt: Date.now() + CHALLENGE_TTL_MS });
    return id;
  }

  /** Consomme le challenge (usage unique) — échoue si expiré ou autre utilisateur. */
  private take(id: string, userId: string): string {
    const p = this.pending.get(id);
    this.pending.delete(id);
    if (!p || p.expiresAt < Date.now() || p.userId !== userId) {
      throw new AppError(400, ERR.VALIDATION, 'Vérification expirée — recommencez');
    }
    return p.challenge;
  }

  // ---------- Enregistrement (utilisateur connecté) ----------

  async registrationOptions(req: FastifyRequest, user: UserRecord) {
    const rpID = this.requireRpId();
    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID,
      userName: user.email,
      userID: new TextEncoder().encode(user.id),
      userDisplayName: user.email,
      excludeCredentials: (user.passkeys ?? []).map((p) => ({
        id: p.credentialId,
        transports: p.transports,
      })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });
    return { challengeId: this.stash(user.id, options.challenge), options };
  }

  async verifyRegistration(
    req: FastifyRequest,
    challengeId: string,
    user: UserRecord,
    response: RegistrationResponseJSON,
  ): Promise<PasskeyRecord> {
    const expectedChallenge = this.take(challengeId, user.id);
    let result;
    try {
      result = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.expectedOrigins(req),
        expectedRPID: this.requireRpId(),
      });
    } catch {
      throw new AppError(400, ERR.VALIDATION, 'Empreinte refusée — recommencez');
    }
    const info = result.registrationInfo;
    if (!result.verified || !info) {
      throw new AppError(400, ERR.VALIDATION, 'Empreinte refusée — recommencez');
    }
    return {
      id: `pk_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      credentialId: info.credential.id,
      publicKey: isoBase64URL.fromBuffer(info.credential.publicKey),
      counter: info.credential.counter,
      transports: info.credential.transports ?? [],
      createdAt: new Date().toISOString(),
    };
  }

  // ---------- Connexion (avant authentification) ----------

  async authenticationOptions(req: FastifyRequest, user: UserRecord) {
    const rpID = this.requireRpId();
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: (user.passkeys ?? []).map((p) => ({
        id: p.credentialId,
        transports: p.transports,
      })),
      userVerification: 'required',
    });
    return { challengeId: this.stash(user.id, options.challenge), options };
  }

  /** Vérifie l'assertion ; retourne la passkey avec son compteur mis à jour. */
  async verifyAuthentication(
    req: FastifyRequest,
    challengeId: string,
    user: UserRecord,
    response: AuthenticationResponseJSON,
  ): Promise<PasskeyRecord> {
    const pk = (user.passkeys ?? []).find((p) => p.credentialId === response.id);
    if (!pk) {
      throw new AppError(400, ERR.VALIDATION, 'Empreinte inconnue — utilisez votre mot de passe');
    }
    const expectedChallenge = this.take(challengeId, user.id);
    let result;
    try {
      result = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.expectedOrigins(req),
        expectedRPID: this.requireRpId(),
        credential: {
          id: pk.credentialId,
          publicKey: isoBase64URL.toBuffer(pk.publicKey),
          counter: pk.counter,
          transports: pk.transports,
        },
      });
    } catch {
      throw new AppError(400, ERR.VALIDATION, 'Empreinte refusée — utilisez votre mot de passe');
    }
    if (!result.verified) {
      throw new AppError(400, ERR.VALIDATION, 'Empreinte refusée — utilisez votre mot de passe');
    }
    return { ...pk, counter: result.authenticationInfo.newCounter };
  }
}
