import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// Connexion par empreinte (WebAuthn) vérifiée de bout en bout avec un
// authentificateur virtuel Chrome : proposition post-login (une fois),
// enregistrement, bouton conditionnel, connexion par empreinte.
// Le compte démo est utilisé (pas de signup → pas de rate limiting) ;
// la passkey créée est retirée en fin de test pour la répétabilité.

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

async function logout(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem('suivid.token');
    location.reload();
  });
}

const accueil = (page: Page) => page.getByRole('heading', { name: 'Calories du jour' });
const fingerprintBtn = (page: Page) =>
  page.getByRole('button', { name: 'Connexion par empreinte' });

/** Supprime toutes les passkeys du compte connecté via l'API. */
async function purgePasskeys(page: Page) {
  await page.evaluate(async () => {
    const h = { authorization: `Bearer ${localStorage.getItem('suivid.token')}` };
    const list = (await (await fetch('/api/me/passkeys', { headers: h })).json()) as { id: string }[];
    for (const p of list) {
      await fetch(`/api/me/passkeys/${p.id}`, { method: 'DELETE', headers: h });
    }
  });
}

test('empreinte : proposition, enregistrement, login par empreinte', async ({ page }) => {
  await addVirtualAuthenticator(page);

  await page.goto('/');
  await page.getByPlaceholder('toi@exemple.fr').fill('demo@suivid.app');
  await page.getByPlaceholder('••••••••').fill('dev');
  await page.getByRole('button', { name: 'Se connecter' }).click();

  // La proposition s'affiche après la connexion (une seule fois) si le
  // compte n'a pas de passkey. Sinon (reliquat d'un run interrompu)
  // on arrive à l'accueil : on purge les passkeys serveur et on
  // recharge pour revoir la proposition.
  const offer = page.getByText('Connexion plus rapide');
  await offer.or(accueil(page)).waitFor();
  if (!(await offer.isVisible())) {
    await purgePasskeys(page);
    await page.reload();
    await expect(offer).toBeVisible();
  }
  await page.getByRole('button', { name: "Activer l'empreinte" }).click();
  await expect(accueil(page)).toBeVisible();

  // Connexion par empreinte : bouton visible car le compte est configuré.
  await logout(page);
  await page.getByPlaceholder('toi@exemple.fr').fill('demo@suivid.app');
  await expect(fingerprintBtn(page)).toBeVisible();
  await fingerprintBtn(page).click();
  await expect(accueil(page)).toBeVisible();

  // Nettoyage : purge toutes les passkeys via l'API pour que le
  // prochain run retrouve l'état initial.
  await purgePasskeys(page);
  const remaining = await page.evaluate(async () => {
    const h = { authorization: `Bearer ${localStorage.getItem('suivid.token')}` };
    return ((await (await fetch('/api/me/passkeys', { headers: h })).json()) as unknown[]).length;
  });
  expect(remaining).toBe(0);
});

// Test très court : la trace Playwright déclenche parfois un ENOENT à la
// fermeture du contexte sous Windows — inutile et flaky ici.
test.describe('empreinte : bouton masqué', () => {
  test.use({ trace: 'off' });

  test('pour un compte sans passkey', async ({ page }) => {
    await addVirtualAuthenticator(page);

    await page.goto('/');
    await page.getByPlaceholder('toi@exemple.fr').fill('inconnu@test.fr');
    await page.waitForTimeout(1500); // debounce + requêtes du statut
    await expect(fingerprintBtn(page)).toBeHidden();
  });
});
