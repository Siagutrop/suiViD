import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Play, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { ProgramExercise } from '@suivi/shared';
import { useExercices, useProgramme, useSaveProgramme } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { ProgrammeEditorBody } from '@/components/ProgrammeEditorBody';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';

export function ProgrammePage() {
  const { id } = useParams<{ id: string }>();
  const { data: programme, isLoading } = useProgramme(id!);
  const { data: exercices } = useExercices();
  const save = useSaveProgramme();

  const [nom, setNom] = useState('');
  const [list, setList] = useState<ProgramExercise[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (programme) {
      setNom(programme.nom);
      setList(programme.exercices.map((e) => ({ ...e })));
      setDirty(false);
    }
  }, [programme]);

  const mutate = (fn: (l: ProgramExercise[]) => ProgramExercise[]) => {
    setList((l) => fn(l));
    setDirty(true);
  };

  const saveAll = async () => {
    try {
      await save.mutateAsync({ id: programme!.id, nom: nom.trim() || programme!.nom, exercices: list });
      setDirty(false);
      toast.success('Programme enregistré');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Enregistrement impossible');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }
  if (!programme) return null;

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon" className="-ml-2">
              <Link to="/seances"><ArrowLeft className="size-5" /></Link>
            </Button>
            <input
              value={nom}
              onChange={(e) => { setNom(e.target.value); setDirty(true); }}
              className="w-full max-w-xs rounded-lg bg-transparent text-2xl font-extrabold tracking-tight focus:bg-bg-2 focus:px-2 focus:outline-none"
              aria-label="Nom du programme"
            />
          </span>
        }
        subtitle={`${list.length} exercices`}
        actions={
          <>
            {programme.statut === 'actif' && (
              <Button asChild variant="secondary" size="sm">
                <Link to={`/seance-active?programme=${programme.id}`}>
                  <Play className="size-4" /> Lancer
                </Link>
              </Button>
            )}
            <Button size="sm" onClick={saveAll} loading={save.isPending} disabled={!dirty}>
              <Save className="size-4" /> Enregistrer
            </Button>
          </>
        }
      />

      <ProgrammeEditorBody
        list={list}
        onMutate={mutate}
        exercices={exercices ?? []}
        dirty={dirty}
      />
    </div>
  );
}
