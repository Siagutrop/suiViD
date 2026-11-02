import { test, expect } from '@playwright/test';

// Parcours : connexion → journal → saisie → rechargement → vérification.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // Écran de connexion
  await page.getByPlaceholder('toi@exemple.fr').fill('demo@suivid.app');
  await page.getByPlaceholder('••••••••').fill('dev');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText('Calories du jour')).toBeVisible();
});

test('connexion + accueil affiche le cockpit', async ({ page }) => {
  await expect(page.getByText(/Bonjour|Bon après-midi|Bonsoir|Bonne nuit/)).toBeVisible();
  await expect(page.getByText('Macronutriments')).toBeVisible();
  await expect(page.getByText('Mode démo')).toBeVisible();
});

test('saisie du journal : remplir, enregistrer, persiste au rechargement', async ({ page }, testInfo) => {
  // Le mock API conserve son état entre les exécutions : « pas » est rendu
  // unique à chaque run pour garantir qu'il y a toujours une modification.
  const uniq = 4000 + (Date.now() % 5000);
  const v =
    testInfo.project.name === 'mobile'
      ? { forme: '7', poids: '78.4', pas: String(uniq) }
      : { forme: '8', poids: '79.1', pas: String(uniq + 1) };

  await page.getByRole('link', { name: 'Journal' }).click();
  await expect(page.getByText('Saisie du jour')).toBeVisible();

  await page.getByRole('button', { name: v.forme, exact: true }).click();
  // Poids (l'app accepte aussi la virgule ; le champ natif attend le point)
  await page.locator('input[name="poids"]').fill(v.poids);
  await page.locator('input[name="pas"]').fill(v.pas);

  await page.getByRole('button', { name: 'Enregistrer la journée' }).click();
  await expect(page.getByText(/Journée enregistrée/)).toBeVisible();

  await page.reload();
  await page.getByRole('link', { name: 'Journal' }).click();
  await expect(page.getByText('Saisie du jour')).toBeVisible();
  await expect(page.locator('input[name="poids"]')).toHaveValue(v.poids);
});

test('navigation bas de page mobile vers les 5 écrans', async ({ page }) => {
  const dests: [string, RegExp][] = [
    ['Journal', /\/journal/],
    ['Séances', /\/seances/],
    ['Exercices', /\/exercices/],
    ['Progrès', /\/progres/],
    ['Accueil', /\/$/],
  ];
  for (const [label, url] of dests) {
    await page.getByRole('link', { name: label, exact: true }).first().click();
    await expect(page).toHaveURL(url);
  }
});
