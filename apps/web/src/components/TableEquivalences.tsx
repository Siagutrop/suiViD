// Table d'équivalences nutritionnelles — pour un aliment et une
// quantité donnés, calcule le grammage de chaque autre aliment de la
// même famille (`groupe`) qui apporte autant du macro choisi
// (auto = macro dominant de la base). Calcul 100 % local.
// Ex. : 100 g de riz basmati ≈ 110 g de coquillettes en glucides.

import { useEffect, useMemo, useState } from 'react';
import { Globe, Loader2, Repeat, Search } from 'lucide-react';
import type { Aliment } from '@suivi/shared';
import { useRechercheAliments } from '@/hooks/queries';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState } from '@/components/ui/misc';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type MacroKey = 'kcal' | 'proteines' | 'glucides' | 'lipides';
const MACROS: { key: MacroKey | 'auto'; label: string }[] = [
  { key: 'auto', label: 'Auto' },
  { key: 'kcal', label: 'Kcal' },
  { key: 'proteines', label: 'Protéines' },
  { key: 'glucides', label: 'Glucides' },
  { key: 'lipides', label: 'Lipides' },
];
const MACRO_LABEL: Record<MacroKey, string> = {
  kcal: 'kcal',
  proteines: 'protéines',
  glucides: 'glucides',
  lipides: 'lipides',
};

export function TableEquivalences({ aliments }: { aliments: Aliment[] }) {
  const [baseId, setBaseId] = useState('');
  const [qty, setQty] = useState('100');
  const [macroSel, setMacroSel] = useState<MacroKey | 'auto'>('auto');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const { data: recherche, isFetching } = useRechercheAliments(debounced);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const base = aliments.find((a) => a.id === baseId) ?? null;
  const q = Math.min(2000, Math.max(1, Number(qty) || 0));

  const macro: MacroKey | null = useMemo(() => {
    if (!base) return null;
    if (macroSel !== 'auto') return macroSel;
    // Macro dominant de la base (en g/100 g) — sinon kcal.
    const entries: [MacroKey, number][] = [
      ['proteines', base.proteines],
      ['glucides', base.glucides],
      ['lipides', base.lipides],
    ];
    const top = entries.sort((a, b) => b[1] - a[1])[0]!;
    return top[1] > 0 ? top[0] : 'kcal';
  }, [base, macroSel]);

  const lignes = useMemo(() => {
    if (!base || !macro || !(q > 0)) return [];
    const cible = (q * base[macro]) / 100;
    if (!(cible > 0)) return [];
    // Même famille si la base en a une, sinon toute la bibliothèque.
    const candidats = aliments.filter(
      (a) => a.id !== base.id && (!base.groupe || (a.groupe ?? '') === base.groupe),
    );
    return candidats
      .map((a) => {
        const par100 = a[macro];
        if (!(par100 > 0.05)) return null;
        // Grammage de `a` qui apporte autant de `macro` que `q` g de base.
        const g = Math.round(((q * base[macro]) / par100) / 5) * 5;
        if (g < 5 || g > 2000) return null;
        return { a, g, kcal: Math.round((a.kcal * g) / 100) };
      })
      .filter((x): x is { a: Aliment; g: number; kcal: number } => !!x)
      .sort((x, y) => x.a.nom.localeCompare(y.a.nom, 'fr'));
  }, [aliments, base, macro, q]);

  /** Résultats de la recherche « comparer avec » — bibliothèque + OFF,
   *  ramenés au même calcul d'équivalence. */
  const resultats = useMemo(() => {
    if (!base || !macro || !(q > 0) || debounced.trim().length < 2) return [];
    type Candidat = { nom: string; macro100: number; kcal100: number; badge: string };
    const candidats: Candidat[] = [
      ...(recherche?.locaux ?? [])
        .filter((a) => a.id !== base.id)
        .map((a) => ({ nom: a.nom, macro100: a[macro], kcal100: a.kcal, badge: 'Bibliothèque' })),
      ...(recherche?.enLigne ?? []).map((a) => ({
        nom: a.marque ? `${a.nom} (${a.marque})` : a.nom,
        macro100: a[macro],
        kcal100: a.kcal,
        badge: 'OFF',
      })),
    ];
    return candidats
      .map((c) => {
        if (!(c.macro100 > 0.05)) return null;
        const g = Math.round(((q * base[macro]) / c.macro100) / 5) * 5;
        if (g < 5 || g > 2000) return null;
        return { ...c, g, kcal: Math.round((c.kcal100 * g) / 100) };
      })
      .filter((x): x is Candidat & { g: number; kcal: number } => !!x)
      .slice(0, 12);
  }, [base, macro, q, recherche, debounced]);

  const famille = base?.groupe ? ` — famille « ${base.groupe} »` : '';

  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Select value={baseId} onValueChange={setBaseId}>
          <SelectTrigger>
            <SelectValue placeholder="Aliment de référence…" />
          </SelectTrigger>
          <SelectContent>
            {aliments.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.nom}
                {a.groupe ? ` · ${a.groupe}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          min={1}
          max={2000}
          suffix="g"
          className="w-24"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {MACROS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMacroSel(m.key)}
            className={cn(
              'rounded-full px-3 py-1 text-[11px] font-bold transition-colors',
              macroSel === m.key ? 'bg-accent text-bg' : 'bg-bg-2/70 text-ink-2 hover:text-ink',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      {!base && (
        <EmptyState
          icon={<Repeat className="size-6" />}
          title="Choisis un aliment"
          description="La table montre le grammage des autres aliments qui apporte le même macro."
        />
      )}
      {base && macro && lignes.length === 0 && (
        <p className="py-3 text-center text-xs text-ink-2">
          Aucun équivalent{base.groupe ? ' dans cette famille' : ''} — vérifie les macros ou le groupe des aliments.
        </p>
      )}
      {base && macro && lignes.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line/50">
          <p className="bg-bg-2/70 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-ink-2">
            ≈ mêmes {MACRO_LABEL[macro]} que {q} g de {base.nom}
            {famille}
          </p>
          <div className="max-h-64 divide-y divide-line/30 overflow-y-auto">
            {lignes.map(({ a, g, kcal }) => (
              <div key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <p className="min-w-0 flex-1 truncate font-semibold">{a.nom}</p>
                <p className="text-[11px] text-ink-2">{kcal} kcal</p>
                <p className="w-16 shrink-0 text-right font-extrabold text-accent">{g} g</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {base && macro && (
        <div className="space-y-2 border-t border-line/40 pt-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-2" />
            <Input
              className="pl-9"
              placeholder="Comparer avec un produit précis (en ligne)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {isFetching && debounced.trim().length >= 2 && (
            <p className="flex items-center justify-center gap-2 py-2 text-xs text-ink-2">
              <Loader2 className="size-4 animate-spin" /> Recherche en ligne…
            </p>
          )}
          {resultats.length > 0 && (
            <div className="divide-y divide-line/30 overflow-hidden rounded-xl border border-line/50">
              {resultats.map((r) => (
                <div key={r.nom} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-semibold">
                      <span className="truncate">{r.nom}</span>
                      <Badge tone={r.badge === 'OFF' ? 'violet' : 'accent'} className="shrink-0">
                        {r.badge === 'OFF' ? <Globe className="size-3" /> : null}
                        {r.badge}
                      </Badge>
                    </p>
                    <p className="text-[11px] text-ink-2">{r.kcal} kcal pour {r.g} g</p>
                  </div>
                  <p className="w-16 shrink-0 text-right font-extrabold text-accent">{r.g} g</p>
                </div>
              ))}
            </div>
          )}
          {!isFetching && debounced.trim().length >= 2 && resultats.length === 0 && (
            <p className="py-2 text-center text-xs text-ink-2">Aucun produit comparable trouvé.</p>
          )}
        </div>
      )}
    </div>
  );
}
