// Page « Alimentation » — suivi nutritionnel du jour :
// aliments consommés (bibliothèque + Open Food Facts), totaux
// comparés aux objectifs du coach, table d'équivalences, et report
// direct des macros dans le journal en un clic.

import { useMemo } from 'react';
import { Apple, Target } from 'lucide-react';
import { toast } from 'sonner';
import { useJournalAliments, useParametres, useToday, useUpdateToday } from '@/hooks/queries';
import { formatDateFr } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';
import { JournalAliments } from '@/components/JournalAliments';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function NutritionPage() {
  const { data: today } = useToday();
  const { data: settings } = useParametres();
  const update = useUpdateToday();
  const date = today?.entry.date ?? '';
  const { data: lignes } = useJournalAliments(date);

  const totals = useMemo(
    () =>
      (lignes ?? []).reduce(
        (acc, l) => ({
          calories: acc.calories + l.kcal,
          proteines: Math.round((acc.proteines + l.proteines) * 10) / 10,
          glucides: Math.round((acc.glucides + l.glucides) * 10) / 10,
          lipides: Math.round((acc.lipides + l.lipides) * 10) / 10,
        }),
        { calories: 0, proteines: 0, glucides: 0, lipides: 0 },
      ),
    [lignes],
  );

  const objectifs = useMemo(() => {
    const defs: [string, number, number | null | undefined, string][] = [
      ['Calories', totals.calories, settings?.objectifCalories, 'kcal'],
      ['Protéines', totals.proteines, settings?.objectifProteines, 'g'],
      ['Glucides', totals.glucides, settings?.objectifGlucides, 'g'],
      ['Lipides', totals.lipides, settings?.objectifLipides, 'g'],
    ];
    return defs
      .filter((o) => o[2] != null && o[2] > 0)
      .map((o) => ({ label: o[0], val: o[1], cible: o[2]!, unite: o[3] }));
  }, [totals, settings]);

  return (
    <div>
      <PageHeader title="Alimentation" subtitle={today ? formatDateFr(today.entry.date) : undefined} />

      {objectifs.length > 0 && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="size-4 text-accent" /> Objectifs du jour
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {objectifs.map(({ label, val, cible, unite }) => {
              const pct = Math.min(100, Math.round((val / cible) * 100));
              const depasse = val > cible * 1.1;
              return (
                <div key={label}>
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="font-bold">{label}</span>
                    <span className={depasse ? 'font-bold text-warn' : 'text-ink-2'}>
                      {val} / {cible} {unite}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-bg-2">
                    <div
                      className={`h-full rounded-full transition-all ${depasse ? 'bg-warn' : 'bg-accent'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {today ? (
        <JournalAliments
          date={today.entry.date}
          onReport={(t) =>
            update.mutate(
              { values: t, force: true },
              {
                onSuccess: () => toast.success('Totaux reportés dans le journal'),
                onError: () => toast.error('Report impossible'),
              },
            )
          }
        />
      ) : (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-sm text-ink-2">
            <Apple className="size-5" /> Chargement du journal…
          </CardContent>
        </Card>
      )}
    </div>
  );
}
