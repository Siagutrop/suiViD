import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// Connexion par empreinte (WebAuthn) vérifiée de bout en bout avec un
// authentificateur virtuel Chrome : proposition post-login (une fois),
// enregistrement, bouton conditionnel, connexion par empreinte.

async function addVirtualAuthenticator(page: Page) {
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

const fingerprintBtn = (page: Page) =>
  page.getByRole('button', { name: 'Connexion par empreinte' });

test('empreinte : proposition après connexion, enregistrement, login par empreinte', async ({
  page,
}) => {
  await addVirtualAuthenticator(page);
  const email = `pk-e2e-${Date.now()}@test.fr`;

  await page.goto('/');
  await page.getByRole('button', { name: "Pas de compte ? S'inscrire" }).click();
  await page.getByPlaceholder('toi@exemple.fr').fill(email);
  await page.getByPlaceholder('••••••••').fill('pass1234');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();

  // Setup initial éventuel (mode mock : liaison simulée).
  const skipSetup = page.getByRole('button', { name: 'Passer cette étape (mode démo)' });
  await skipSetup.or(page.getByText('Connexion plus rapide')).waitFor();
  if (await skipSetup.isVisible()) {
    await skipSetup.click();
    await page.getByRole('button', { name: "Accéder à l'application" }).click();
  }

  // La page de proposition s'affiche après la première connexion.
  await expect(page.getByText('Connexion plus rapide')).toBeVisible();
  await page.getByRole('button', { name: "Activer l'empreinte" }).click();
  await expect(page.getByText('Calories du jour')).toBeVisible();

  // Déconnexion → le bouton empreinte apparaît car le compte est configuré.
  await page.evaluate(() => {
    localStorage.removeItem('suivid.token');
    location.reload();
  });
  await page.getByPlaceholder('toi@exemple.fr').fill(email);
  await expect(fingerprintBtn(page)).toBeVisible();
  await fingerprintBtn(page).click();
  await expect(page.getByText('Calories du jour')).toBeVisible();
});

test('empreinte : bouton masqué pour un compte sans passkey', async ({ page }) => {
  await addVirtualAuthenticator(page);
  const email = `pk-none-${Date.now()}@test.fr`;

  await page.goto('/');
  await page.getByRole('button', { name: "Pas de compte ? S'inscrire" }).click();
  await page.getByPlaceholder('toi@exemple.fr').fill(email);
  await page.getByPlaceholder('••••••••').fill('pass1234');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();

  // Passer la proposition d'enregistrement pour revenir au login.
  const skipSetup = page.getByRole('button', { name: 'Passer cette étape (mode démo)' });
  await skipSetup.or(page.getByText('Connexion plus rapide')).waitFor();
  if (await skipSetup.isVisible()) {
    await skipSetup.click();
    await page.getByRole('button', { name: "Accéder à l'application" }).click();
  }
  await page.getByRole('button', { name: 'Plus tard' }).click();
  await expect(page.getByText('Calories du jour')).toBeVisible();

  await page.evaluate(() => {
    localStorage.removeItem('suivid.token');
    location.reload();
  });
  await page.getByPlaceholder('toi@exemple.fr').fill(email);
  await page.waitForTimeout(900); // debounce de vérification du statut
  await expect(fingerprintBtn(page)).toBeHidden();
});
