import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

// ------------------------------------------------------------------
// Service worker custom (injectManifest) : précache Workbox + routage
// SPA identique à l'ancien generateSW, plus les handlers push pour les
// rappels de séance. La tsconfig du front n'embarque pas la lib
// « webworker » — le strict minimum est typé localement.
// ------------------------------------------------------------------

interface SwClient {
  url: string;
  focus(): Promise<unknown>;
  navigate(url: string): Promise<unknown>;
}

interface WaitUntilEvent {
  waitUntil(promise: Promise<unknown>): void;
}

interface SwSelf {
  __WB_MANIFEST: Parameters<typeof precacheAndRoute>[0];
  registration: {
    showNotification(title: string, options?: NotificationOptions): Promise<void>;
  };
  clients: {
    matchAll(opts?: { type?: string; includeUncontrolled?: boolean }): Promise<SwClient[]>;
    openWindow(url: string): Promise<unknown>;
  };
  skipWaiting(): Promise<void>;
  addEventListener(
    type: 'push',
    cb: (e: WaitUntilEvent & { data: { json(): unknown } | null }) => void,
  ): void;
  addEventListener(
    type: 'notificationclick',
    cb: (e: WaitUntilEvent & { notification: { close(): void; data: unknown } }) => void,
  ): void;
  addEventListener(type: 'message', cb: (e: { data: unknown }) => void): void;
}

declare const self: SwSelf;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
// SPA : toutes les navigations retombent sur index.html, sauf l'API.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api/] }));

// registerType 'autoUpdate' : virtual:pwa-register envoie SKIP_WAITING
// quand une nouvelle version est prête.
self.addEventListener('message', (e) => {
  if ((e.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});

// ---------- Notifications push (rappels de séance) ----------

interface PushData {
  title?: string;
  body?: string;
  url?: string;
}

self.addEventListener('push', (e) => {
  let data: PushData = {};
  try {
    data = (e.data?.json() ?? {}) as PushData;
  } catch {
    // Corps non-JSON : valeurs par défaut.
  }
  e.waitUntil(
    self.registration.showNotification(data.title ?? 'SuiViD', {
      body: data.body ?? '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data as { url?: string } | undefined)?.url ?? '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        void client.navigate(url);
        return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
