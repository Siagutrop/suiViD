// ------------------------------------------------------------------
// Notifications push côté navigateur : support, permission,
// souscription via PushManager (clé VAPID publique du serveur).
// ------------------------------------------------------------------

export function pushSupported(): boolean {
  return (
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  );
}

/** État de la permission de notifications du navigateur. */
export function pushPermission(): NotificationPermission | 'unsupported' {
  return pushSupported() ? Notification.permission : 'unsupported';
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * Demande la permission puis souscrit l'appareil. Retourne l'objet
 * tel qu'attendu par POST /api/me/push.
 */
export async function subscribeDevice(publicKey: string): Promise<{ endpoint: string; keys: { p256dh: string; auth: string } }> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    throw new Error(
      perm === 'denied'
        ? 'Notifications bloquées — autorise-les dans les réglages du navigateur'
        : 'Permission refusée',
    );
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('Souscription invalide retournée par le navigateur');
  }
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

/** Désabonne l'appareil courant et retourne son endpoint (à purger côté serveur). */
export async function unsubscribeDevice(): Promise<string | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  const endpoint = sub?.endpoint ?? null;
  await sub?.unsubscribe();
  return endpoint;
}
