import { test, expect } from '@playwright/test';

// Parcours : connexion → démarrer une séance → valider une série →
// rechargement (brouillon récupéré) → terminer → historique.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('toi@exemple.fr').fill('demo@suivid.app');
  await page.getByPlaceholder('••••••••').fill('dev');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText('Calories du jour')).toBeVisible();
});

test('séance complète : démarrer, valider, recharger, terminer', async ({ page }) => {
  // Démarrer depuis l'accueil
  await page.getByRole('link', { name: /Commencer/ }).click();
  await expect(page.getByText('Démarrer une séance')).toBeVisible();
  await page.getByRole('button', { name: 'Commencer la séance' }).click();

  // Écran séance : exercice 1/11, chrono visible
  await expect(page.getByText('Exercice 1/11')).toBeVisible();
  await expect(page.getByText('Développé Couché Smith Machine')).toBeVisible();

  // Remplir + valider la série 1
  await page.getByPlaceholder('0').first().fill('60');
  await page.getByPlaceholder('0').nth(1).fill('10');
  await page.getByRole('button', { name: 'Valider la série' }).first().click();
  await expect(page.getByText('Récupération')).toBeVisible();

  // Rechargement → le brouillon doit être récupéré (non synchronisé)
  await page.reload();
  await expect(page.getByText('non synchronisée')).toBeVisible();
  await expect(page.getByText('Exercice 1/11')).toBeVisible();

  // Naviguer puis terminer
  await page.getByRole('button', { name: 'Suivant' }).click();
  await expect(page.getByText('Exercice 2/11')).toBeVisible();

  // Aller à la fin via les points de progression
  for (let i = 0; i < 10; i++) {
    const next = page.getByRole('button', { name: 'Suivant' });
    if (await next.isVisible().catch(() => false)) await next.click();
  }
  await page.getByRole('button', { name: 'Terminer', exact: true }).click();
  await expect(page.getByText('Fin de séance')).toBeVisible();
  await page.getByRole('button', { name: 'Enregistrer la séance' }).click();

  // Retour à l'historique — nouvelle séance en tête
  await expect(page.getByText('Historique des séances')).toBeVisible();
});
