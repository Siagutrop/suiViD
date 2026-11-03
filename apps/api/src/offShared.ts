// ------------------------------------------------------------------
// Partagé entre le proxy OFF (off.ts) et la copie locale (offDb.ts) —
// mots vides et extraction du token enseigne.
// ------------------------------------------------------------------

export const STOPWORDS = new Set([
  'de', 'le', 'la', 'les', 'et', 'au', 'aux', 'du', 'des', 'en', 'à', 'a', 'd', 'l', 'sans', 'avec',
]);

// Marques de grande distribution / industriels — un token de la
// requête qui désigne une enseigne est sorti des termes et devient un
// filtre sur la marque : « pâtes u » → terms=pâtes + marque=u.
const SINGLE_BRANDS = new Set([
  'u', 'carrefour', 'auchan', 'leclerc', 'intermarché', 'intermarche', 'casino',
  'monoprix', 'franprix', 'lidl', 'aldi', 'picard', 'netto', 'harrys', 'jacquet',
  'nestlé', 'nestle', 'danone', 'yoplait', 'président', 'president', 'lu',
  'bonnemaman', 'herta', 'materne', 'andros', 'repère', 'simpl', 'eco+', 'éco+',
]);
const MULTI_BRANDS = [
  'grand jury', 'bonne maman', 'petit navire', 'fleury michon',
  'marque repère', 'top budget', 'reflets de france',
];

/** Sépare le token enseigne du reste de la requête, s'il y en a un. */
export function extractBrand(key: string): { terms: string; brand: string | null } {
  for (const b of MULTI_BRANDS) {
    if (key.includes(b)) return { terms: key.replace(b, ' ').replace(/\s+/g, ' ').trim(), brand: b };
  }
  const words = key.split(/\s+/);
  const hit = words.find((w) => SINGLE_BRANDS.has(w));
  if (!hit) return { terms: key, brand: null };
  return { terms: words.filter((w) => w !== hit).join(' '), brand: hit };
}
