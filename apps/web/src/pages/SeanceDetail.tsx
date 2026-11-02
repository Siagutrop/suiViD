import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock } from 'lucide-react';
import { sessionVolume } from '@suivi/shared';
import { useSeance } from '@/hooks/queries';
import { formatDateFr, formatDuration, formatKg } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, Skeleton } from '@/components/ui/misc';

export function SeanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: s, isLoading } = useSeance(id!);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!s) return null;

  const volume = sessionVolume(s);

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon" className="-ml-2">
              <Link to="/seances"><ArrowLeft className="size-5" /></Link>
            </Button>
            {s.programmeNom}
          </span>
        }
        subtitle={
          <span className="capitalize">
            {formatDateFr(s.date)} · <Clock className="inline size-3.5" /> {formatDuration(s.dureeSec)}
          </span>
        }
        actions={<Badge tone={s.statut === 'terminee' ? 'success' : 'warn'}>{s.statut === 'terminee' ? 'Terminée' : 'Abandonnée'}</Badge>}
      />

      <div className="mb-5 grid grid-cols-3 gap-3 text-center">
        <Card className="p-4">
          <p className="num-display text-2xl">{s.exercices.filter((e) => !e.passee).length}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-2">Exercices</p>
        </Card>
        <Card className="p-4">
          <p className="num-display text-2xl">{s.exercices.reduce((a, e) => a + e.sets.filter((x) => x.terminee).length, 0)}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-2">Séries</p>
        </Card>
        <Card className="p-4">
          <p className="num-display text-2xl">{Math.round(volume)}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-2">kg volume</p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Détail des exercices</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-line/60 p-0 px-5 pb-3">
          {s.exercices.map((e) => (
            <div key={e.ordre} className={cn('py-3.5', e.passee && 'opacity-50')}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">{e.exercice}</p>
                {e.passee && <Badge tone="warn">Passé</Badge>}
              </div>
              {!e.passee && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {e.sets.map((set) => (
                    <span
                      key={set.serie}
                      className={cn(
                        'rounded-lg px-2.5 py-1 text-xs font-bold',
                        set.terminee ? 'bg-success/15 text-success' : 'bg-line/50 text-ink-2 line-through',
                      )}
                    >
                      {formatKg(set.chargeKg)} × {set.repetitions ?? '—'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      {s.notes && <p className="mt-4 rounded-xl border border-line bg-card p-4 text-sm text-ink-2">{s.notes}</p>}
    </div>
  );
}
