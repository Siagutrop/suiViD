// Captures d'écran livrables — mobile (Pixel 7) et desktop.
// Usage : node scripts/screenshots.mjs  (dev servers requis : 5173 + 3001)
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = 'docs/screenshots';
mkdirSync(OUT, { recursive: true });

const shots = [
  { path: '/', name: 'accueil', wait: 'Calories du jour' },
  { path: '/journal', name: 'journal', wait: 'Saisie du jour' },
  { path: '/seances', name: 'seances', wait: 'Full body' },
  { path: '/exercices', name: 'exercices', wait: 'mouvements' },
  { path: '/progres', name: 'progres', wait: 'Poids' },
];

async function capture(label, contextOpts) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(contextOpts);
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/');
  await page.getByPlaceholder('••••••••').fill('dev');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForSelector('text=Calories du jour');
  await page.waitForTimeout(600);
  for (const s of shots) {
    await page.goto(`http://localhost:5173${s.path}`);
    await page.waitForSelector(`text=${s.wait}`, { timeout: 15000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${label}-${s.name}.png` });
    console.log(`${label}-${s.name}.png`);
  }
  await browser.close();
}

await capture('mobile', { ...devices['Pixel 7'] });
await capture('desktop', { viewport: { width: 1440, height: 900 } });
console.log('OK → docs/screenshots/');
