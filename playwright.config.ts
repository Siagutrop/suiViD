import { defineConfig, devices } from '@playwright/test';

// Parcours utilisateur contre le MODE DÉMO (aucun accès Google).
// Démarre l'API (mock) + le frontend Vite automatiquement.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // Sous Windows, la copie des traces à la fermeture du contexte échoue
  // parfois (ENOENT interne) — un retry absorbe ce flake infrastructurel.
  retries: 1,
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
      // tsx direct (pas "watch") : le process est tué proprement par
      // Playwright — un enfant tsx watch orphelin conserverait le port
      // et l'état (rate limiting, données) entre les exécutions.
      command: 'npx tsx apps/api/src/index.ts',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: true,
      // Fichiers isolés (gitignored) : compte démo seedé, aucune
      // pollution de data/users.json ni du store mock réels.
      env: {
        DATA_MODE: 'mock',
        AUTH_SECRET: 'e2e-secret-key-1234567890',
        LOG_LEVEL: 'error',
        USERS_FILE: 'data/e2e-users.json',
        MOCK_STORE_FILE: 'data/e2e-mock.json',
        // Chaque test se connecte : lever la limite (10/5min) pour la suite.
        AUTH_RATE_LIMIT_MAX: '500',
      },
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
