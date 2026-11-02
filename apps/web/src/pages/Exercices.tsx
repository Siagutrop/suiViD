import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Play, Search, VideoOff } from 'lucide-react';
import type { Exercise } from '@suivi/shared';
import { useExercices, useLastPerf } from '@/hooks/queries';
import { cn, formatKg, youtubeId } from '@/lib/utils';
import { getBuild } from '@/lib/body';
import { BodyMap } from '@/components/BodyMap';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, Skeleton } from '@/components/ui/misc';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

export function ExercicesPage() {
  const { data: exercices, isLoading } = useExercices();
  const { data: lastPerf } = useLastPerf();
  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState<string>('tous');
  const [selected, setSelected] = useState<Exercise | null>(null);

  const muscles = useMemo(
    () => ['tous', ...new Set((exercices ?? []).map((e) => e.muscle)).values()].sort((a, b) => (a === 'tous' ? -1 : a.localeCompare(b))),
    [exercices],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (exercices ?? []).filter(
      (e) => (muscle === 'tous' || e.muscle === muscle) && (!q || e.nom.toLowerCase().includes(q)),
    );
  }, [exercices, search, muscle]);

  return (
    <div>
      <PageHeader title="Exercices" subtitle={`${exercices?.length ?? '…'} mouvements — bibliothèque`} />

      {/* Recherche + filtres */}
      <div className="sticky top-0 z-20 -mx-4 mb-4 bg-bg/90 px-4 pb-3 pt-2 backdrop-blur-xl">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-2" />
          <Input
            className="pl-10"
            placeholder="Rechercher un exercice…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {muscles.map((m) => (
            <button
              key={m}
              onClick={() => setMuscle(m)}
              className={cn('chip shrink-0 transition-colors', muscle === m && 'chip-active')}
            >
              {m === 'tous' ? 'Tous' : m}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <EmptyState
          icon={<Search className="size-6" />}
          title="Aucun exercice trouvé"
          description="Essayez un autre terme ou un autre groupe musculaire."
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((e, i) => (
          <motion.button
            key={`${e.nom}-${i}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.02, 0.3) }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setSelected(e)}
            className="card flex w-full min-w-0 items-center gap-4 p-4 text-left transition-colors hover:border-line hover:bg-line/20"
          >
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-bg-2 text-accent">
              {e.videoUrl ? <Play className="size-5" /> : <VideoOff className="size-5 text-ink-2/50" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{e.nom}</p>
              <p className="mt-0.5 text-xs text-ink-2">{e.muscle}</p>
            </div>
            <Badge tone="default">{e.muscle.slice(0, 4)}</Badge>
          </motion.button>
        ))}
      </div>

      {/* Fiche exercice + vidéo */}
      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[85dvh] p-0">
          {selected && (
            <>
              <div className="px-6 pt-6">
                <DialogTitle className="pr-8">{selected.nom}</DialogTitle>
                <div className="mt-2 flex items-center gap-2">
                  <Badge tone="violet">{selected.muscle}</Badge>
                  {selected.videoUrl && <Badge tone="accent">Vidéo</Badge>}
                </div>
              </div>
              <div className="p-6 pt-4">
                {/* Muscles travaillés — silhouette avant/dos */}
                <div className="mb-4 rounded-2xl bg-bg-2/60 p-3">
                  <p className="mb-1 text-center text-[10px] font-bold uppercase tracking-wider text-ink-2">
                    Muscles travaillés
                  </p>
                  <BodyMap muscles={[selected.muscle]} build={getBuild()} height={200} labels />
                  {lastPerf?.[selected.nom]?.length ? (
                    <p className="mt-1 text-center text-xs text-ink-2">
                      Dernière perf :{' '}
                      <strong className="text-ink">
                        {formatKg(lastPerf[selected.nom]![0]!.chargeKg)}
                        {lastPerf[selected.nom]![0]!.repetitions != null &&
                          ` × ${lastPerf[selected.nom]![0]!.repetitions}`}
                      </strong>
                    </p>
                  ) : null}
                </div>
                {selected.videoUrl && youtubeId(selected.videoUrl) ? (
                  <div className="aspect-[9/16] max-h-[55dvh] w-full overflow-hidden rounded-2xl bg-black sm:aspect-video sm:max-h-none">
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${youtubeId(selected.videoUrl)}?rel=0`}
                      className="size-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      title={selected.nom}
                    />
                  </div>
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-2xl bg-bg-2 text-ink-2">
                    <div className="text-center">
                      <VideoOff className="mx-auto mb-2 size-8" />
                      <p className="text-sm">Pas de vidéo pour cet exercice</p>
                    </div>
                  </div>
                )}
                {selected.videoUrl && (
                  <a
                    href={selected.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 block text-center text-xs font-semibold text-accent underline underline-offset-2"
                  >
                    Ouvrir sur YouTube
                  </a>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
