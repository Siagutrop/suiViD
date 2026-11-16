import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import type { PasskeyInfo } from '@suivi/shared';
import { api } from './api';

// ------------------------------------------------------------------
// Connexion par empreinte / FaceID / PIN d'appareil (WebAuthn).
// Le bouton du login ne s'affiche que si : appareil compatible ET
// serveur configuré ET compte avec au moins une passkey (exists).
// ------------------------------------------------------------------

/** L'appareil gère-t-il un authentificateur de plateforme (empreinte, FaceID, PIN) ? */
export async function biometryAvailable(): Promise<boolean> {
  if (!browserSupportsWebAuthn()) return false;
  try {
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

/** Le compte saisi a-t-il une empreinte enregistrée (et le serveur est-il configuré) ? */
export async function passkeyStatus(email: string): Promise<boolean> {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return false;
  try {
    const r = await api.post<{ enabled: boolean; exists: boolean }>('/auth/passkey/exists', {
      email,
    });
    return r.enabled && r.exists;
  } catch {
    return false;
  }
}

/** Connexion par empreinte : options → assertion du navigateur → jeton. */
export async function loginWithPasskey(email: string) {
  const { challengeId, options } = await api.post<{
    challengeId: string;
    options: PublicKeyCredentialRequestOptionsJSON;
  }>('/auth/passkey/login/options', { email });
  const response = await startAuthentication({ optionsJSON: options });
  return api.post<{ token: string; expiresIn: number; email: string }>(
    '/auth/passkey/login/verify',
    { email, challengeId, response },
  );
}

/** Enregistre l'empreinte / FaceID de l'appareil sur le compte connecté. */
export async function registerPasskey(): Promise<PasskeyInfo> {
  const { challengeId, options } = await api.post<{
    challengeId: string;
    options: PublicKeyCredentialCreationOptionsJSON;
  }>('/auth/passkey/register/options');
  const response = await startRegistration({ optionsJSON: options });
  return api.post<PasskeyInfo>('/auth/passkey/register/verify', { challengeId, response });
}

// Proposition d'enregistrement « une seule fois » — mémorisée par compte
// et par appareil (localStorage).
const OFFER_KEY = 'suivid.passkeyOffer';
export function passkeyOfferSeen(userId: string): boolean {
  return localStorage.getItem(`${OFFER_KEY}.${userId}`) === '1';
}
export function markPasskeyOfferSeen(userId: string): void {
  localStorage.setItem(`${OFFER_KEY}.${userId}`, '1');
}
