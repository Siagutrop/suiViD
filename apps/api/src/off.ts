// ------------------------------------------------------------------
// Recherche Open Food Facts — base de produits française, gratuite et
// sans clé. Le serveur proxifie pour masquer les requêtes et normaliser
// les nutriments (valeurs pour 100 g) en `AlimentExterne`.
// Une requête purement numérique (8–14 chiffres) est traitée comme un
// code-barres → lookup produit direct.
// ------------------------------------------------------------------

import type { AlimentExterne } from '@suivi/shared';

const UA = 'SuiViD/0.2 (application de suivi nutritionnel)';
// Domaine fr.* : base francophone → noms français en priorité (et plus
// stable que world.* observé en 503 lors des tests).
const BASE = 'https://fr.openfoodfacts.org';
// Cache long : OFF rate-limite les appels anonymes en rafale — les
// résultats d'une recherche changent peu, 30 min de cache suffit.
const TTL = 30 * 60_000;
const cache = new Map<string, { at: number; data: AlimentExterne[] }>();
// Backoff global : OFF limite par IP — après un échec on espace les appels.
let lastFailAt = 0;

import { extractBrand, STOPWORDS } from './offShared.js';
import type { OffDbStore } from './offDb.js';

// Copie locale OFF — injectée au démarrage quand SQLite est actif.
let local: OffDbStore | null = null;
export function initLocalOff(store: OffDbStore | null): void {
  local = store;
}

function brandTokens(brands: string): Set<string> {
  return new Set(
    brands
      .toLowerCase()
      .split(/[,\s;&'()-]+/)
      .filter(Boolean),
  );
}

/** vrai si un mot de la requête désigne une marque du produit. */
function brandMatch(brands: string | null, queryTokens: string[]): boolean {
  if (!brands) return false;
  const bt = brandTokens(brands);
  return queryTokens.some((t) => bt.has(t));
}

interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_fr?: string;
  brands?: string;
  image_small_url?: string;
  unique_scans_n?: number;
  nutriments?: Record<string, unknown>;
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
}

/** kcal pour 100 g — OFF fournit parfois seulement l'énergie en kJ. */
function kcal100(n: Record<string, unknown>): number | null {
  const kcal = num(n['energy-kcal_100g']);
  if (kcal != null) return Math.round(kcal);
  const kj = num(n['energy_100g']) ?? num(n['energy-kj_100g']);
  if (kj != null) {
    // Heuristique : > 500 → valeur en kJ, sinon déjà en kcal.
    return Math.round(kj > 500 ? kj / 4.184 : kj);
  }
  return null;
}

function normalize(p: OffProduct): AlimentExterne | null {
  const nom = (p.product_name_fr ?? p.product_name ?? '').trim();
  if (!nom) return null;
  const n = p.nutriments ?? {};
  const kcal = kcal100(n);
  if (kcal == null) return null; // sans énergie la ligne est inutilisable
  const proteines = num(n.proteins_100g);
  const glucides = num(n.carbohydrates_100g);
  const lipides = num(n.fat_100g);
  const r1 = (x: number | null) => (x == null ? 0 : Math.round(x * 10) / 10);
  return {
    source: 'off',
    codeBarre: p.code ?? null,
    nom,
    marque: (p.brands ?? '').split(',')[0]?.trim() || null,
    kcal,
    proteines: r1(proteines),
    glucides: r1(glucides),
    lipides: r1(lipides),
    image: p.image_small_url ?? null,
    complet: proteines != null && glucides != null && lipides != null,
  };
}

export async function searchOpenFoodFacts(q: string): Promise<AlimentExterne[]> {
  const key = q.trim().toLowerCase();
  if (key.length < 2) return [];
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  const isBarcode = /^\d{8,14}$/.test(key);

  // Copie locale : instantanée et sans limite de débit. On ne descend
  // en ligne que si elle ne contient rien (produit récent/rare).
  if (local && local.count() > 0) {
    if (isBarcode) {
      const b = local.barcode(key);
      if (b) return [b];
    } else {
      const hits = local.search(key);
      if (hits.length > 0) return hits;
    }
  }
  let url: string;
  if (isBarcode) {
    url = `${BASE}/api/v0/product/${key}.json`;
  } else {
    // Token enseigne → facette brands (« pâtes u » → terms=pâtes, brands=u).
    const { terms, brand } = extractBrand(key);
    url = `${BASE}/cgi/search.pl?action=process&json=1&page_size=40`;
    if (terms) url += `&search_terms=${encodeURIComponent(terms)}&search_simple=1`;
    if (brand) url += `&tagtype_0=brands&tag_contains_0=contains&tag_0=${encodeURIComponent(brand)}`;
    url +=
      `&tagtype_${brand ? 1 : 0}=countries&tag_contains_${brand ? 1 : 0}=contains` +
      `&tag_${brand ? 1 : 0}=france` +
      '&fields=code,product_name,product_name_fr,brands,nutriments,image_small_url,unique_scans_n';
  }

  // OFF rate-limite : un échec récent → réponse vide immédiate (45 s),
  // sinon on retente une fois après une courte pause.
  if (Date.now() - lastFailAt < 45_000) return [];

  let products: OffProduct[] = [];
  let ok = false;
  for (let attempt = 0; attempt < 2 && !ok; attempt++) {
    try {
      if (attempt) await new Promise((r) => setTimeout(r, 1500));
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      // OFF renvoie une page HTML quand il rate-limite.
      if (!text.trimStart().startsWith('{')) continue;
      const data = JSON.parse(text) as { products?: OffProduct[]; product?: OffProduct; status?: number };
      products = isBarcode ? (data.status === 1 && data.product ? [data.product] : []) : (data.products ?? []);
      ok = true;
    } catch {
      /* réseau/timeout — on retente une fois */
    }
  }
  if (!ok) {
    lastFailAt = Date.now();
    return [];
  }
  lastFailAt = 0;

  // Tokens de marque dans la requête (« u » accepté bien que 1 lettre).
  const tokens = key
    .split(/\s+/)
    .filter((t) => (t.length >= 2 && !STOPWORDS.has(t)) || t === 'u');

  const seen = new Set<string>();
  const scored: { a: AlimentExterne; score: number }[] = [];
  products.forEach((p, idx) => {
    const a = normalize(p);
    if (!a) return;
    const dedup = `${a.nom.toLowerCase()}|${a.marque ?? ''}`;
    if (seen.has(dedup)) return;
    seen.add(dedup);
    // Score : popularité (scans réels) + match de marque + complétude,
    // léger bonus pour l'ordre de pertinence renvoyé par OFF.
    const score =
      Math.log1p(p.unique_scans_n ?? 0) +
      (brandMatch(p.brands ?? null, tokens) ? 6 : 0) +
      (a.complet ? 2 : 0) +
      (a.image ? 1 : 0) +
      Math.max(0, (40 - idx) * 0.05);
    scored.push({ a, score });
  });

  const out = scored
    .sort((x, y) => y.score - x.score)
    .slice(0, 10)
    .map((s) => s.a);
  cache.set(key, { at: Date.now(), data: out });
  return out;
}
