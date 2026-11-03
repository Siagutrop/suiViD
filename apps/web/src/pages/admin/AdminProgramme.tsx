import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { ProgramExercise } from '@suivi/shared';
import { useAdminOverview, useAdminSaveProgramme, useExercices } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { ProgrammeEditorBody } from '@/components/ProgrammeEditorBody';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';

/** Édition du programme d'un client (rôle coach). */
export function AdminProgrammePage() {
  const { id, progId } = useParams<{ id: string; progId: string }>();
  const navigate = useNavigate();
  const { data: overview, isLoading } = useAdminOverview(id!);
  const { data: exercices } = useExercices();
  const save = useAdminSaveProgramme(id!);

  const isNew = progId === 'nouveau';
  const programme = useMemo(
    () => (isNew ? null : (overview?.programmes.find((p) => p.id === progId) ?? null)),
    [overview, progId, isNew],
  );

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
      await save.mutateAsync({
        progId: isNew ? undefined : progId!,
        nom: nom.trim() || (isNew ? 'Nouveau programme' : programme!.nom),
        exercices: list,
      });
      setDirty(false);
      toast.success(isNew ? 'Programme créé pour le client' : 'Programme du client enregistré');
      if (isNew) navigate(`/admin/clients/${id}`);
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
  if (!programme && !isNew) {
    return (
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to={`/admin/clients/${id}`}><ArrowLeft className="size-4" /> Retour au client</Link>
        </Button>
        <p className="mt-4 text-sm text-ink-2">Programme introuvable.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon" className="-ml-2">
              <Link to={`/admin/clients/${id}`}><ArrowLeft className="size-5" /></Link>
            </Button>
            <input
              value={nom}
              onChange={(e) => { setNom(e.target.value); setDirty(true); }}
              className="w-full max-w-xs rounded-lg bg-transparent text-2xl font-extrabold tracking-tight focus:bg-bg-2 focus:px-2 focus:outline-none"
              aria-label="Nom du programme"
            />
          </span>
        }
        subtitle={`${list.length} exercices — programme du client`}
        actions={
          <Button size="sm" onClick={saveAll} loading={save.isPending} disabled={!dirty && !isNew}>
            <Save className="size-4" /> Enregistrer
          </Button>
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
