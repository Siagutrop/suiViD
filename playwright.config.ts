import { defineConfig, devices } from '@playwright/test';

// Parcours utilisateur contre le MODE DÉMO (aucun accès Google).
// Démarre l'API (mock) + le frontend Vite automatiquement.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    locale: 'fr-FR',
    viewport: { width: 390, height: 844 }, // mobile-first
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    {
      command: 'npm run dev:api',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: true,
      env: { DATA_MODE: 'mock', APP_PASSWORD: 'dev', AUTH_SECRET: 'e2e-secret-key-1234567890', LOG_LEVEL: 'error' },
      timeout: 60_000,
    },
    {
      command: 'npm run dev:web',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
