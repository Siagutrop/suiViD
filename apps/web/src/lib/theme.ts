// Gestion des thèmes — [data-theme] sur <html>, persistance locale.

export const THEMES = [
  { id: 'sombre', nom: 'Sombre', desc: 'Le thème SuiViD d’origine', dark: true, swatches: ['#090B10', '#171C26', '#B8F34B'] },
  { id: 'bordeaux', nom: 'Bordeaux', desc: 'Sombre aux tons vin & doré', dark: true, swatches: ['#100C10', '#1D161F', '#E14D6E'] },
  { id: 'clair', nom: 'Clair', desc: 'Lumineux, vert citron', dark: false, swatches: ['#F2F4F8', '#FFFFFF', '#4E9B0E'] },
  { id: 'sable', nom: 'Sable', desc: 'Papier chaud, bordeaux profond', dark: false, swatches: ['#F6F1E8', '#FDFBF6', '#A3163F'] },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

const KEY = 'suivid:theme';
const IDS = new Set<string>(THEMES.map((t) => t.id));

export function getTheme(): ThemeId {
  try {
    const t = localStorage.getItem(KEY);
    if (t && IDS.has(t)) return t as ThemeId;
  } catch {
    /* stockage indisponible */
  }
  return 'sombre';
}

export function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* stockage indisponible */
  }
}
