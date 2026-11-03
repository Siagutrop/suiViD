// Champs de suivi personnalisés — définis par le coach pour ce client
// (tour de taille, eau bue, humeur…). Saisie directe avec sauvegarde
// automatique à la perte de focus. Masqué si aucun champ n'existe.

import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { useChampsValeurs, useSetChampValeur } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export function JournalChamps({ date }: { date: string }) {
  const { data: valeurs, isLoading } = useChampsValeurs(date);
  const setValeur = useSetChampValeur(date);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (isLoading || !valeurs?.length) return null;

  const save = async (champId: string) => {
    const raw = (drafts[champId] ?? '').trim();
    const current = valeurs.find((v) => v.champId === champId)?.valeur ?? null;
    const next = raw === '' ? null : raw;
    if (next === current) return;
    try {
      await setValeur.mutateAsync({ champId, valeur: next });
      toast.success('Mesure enregistrée', { duration: 1500 });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Enregistrement impossible');
    }
  };

  return (
    <Card className="mt-5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-violet" /> Mesures du coach
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {valeurs.map((c) => (
            <div key={c.champId}>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-2">
                {c.nom}
                {c.unite ? <span className="ml-1 text-ink-2/70">({c.unite})</span> : null}
              </label>
              <Input
                value={drafts[c.champId] ?? c.valeur ?? ''}
                onChange={(e) => setDrafts({ ...drafts, [c.champId]: e.target.value })}
                onBlur={() => void save(c.champId)}
                placeholder="—"
              />
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[11px] text-ink-2">Enregistré automatiquement quand tu quittes le champ.</p>
      </CardContent>
    </Card>
  );
}
