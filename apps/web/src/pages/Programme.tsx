import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  GripVertical,
  Play,
  Plus,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ProgramExercise } from '@suivi/shared';
import { useExercices, useProgramme, useSaveProgramme } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge, Skeleton } from '@/components/ui/misc';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function ProgrammePage() {
  const { id } = useParams<{ id: string }>();
  const { data: programme, isLoading } = useProgramme(id!);
  const { data: exercices } = useExercices();
  const save = useSaveProgramme();
  const navigate = useNavigate();

  const [nom, setNom] = useState('');
  const [list, setList] = useState<ProgramExercise[]>([]);
  const [dirty, setDirty] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState<string>('tous');

  useEffect(() => {
    if (programme) {
      setNom(programme.nom);
      setList(programme.exercices.map((e) => ({ ...e })));
      setDirty(false);
    }
  }, [programme]);

  const muscles = useMemo(
    () => ['tous', ...new Set((exercices ?? []).map((e) => e.muscle).sort())],
    [exercices],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (exercices ?? [])
      .filter((e) => (muscle === 'tous' || e.muscle === muscle) && (!q || e.nom.toLowerCase().includes(q)))
      .slice(0, 40);
  }, [exercices, search, muscle]);

  const mutate = (fn: (l: ProgramExercise[]) => ProgramExercise[]) => {
    setList((l) => fn(l));
    setDirty(true);
  };
  const move = (i: number, dir: -1 | 1) =>
    mutate((l) => {
      const j = i + dir;
      if (j < 0 || j >= l.length) return l;
      const c = [...l];
      [c[i], c[j]] = [c[j]!, c[i]!];
      return c;
    });
  const remove = (i: number) => mutate((l) => l.filter((_, j) => j !== i));
  const patch = (i: number, p: Partial<ProgramExercise>) =>
    mutate((l) => l.map((e, j) => (j === i ? { ...e, ...p } : e)));

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

      <div className="space-y-2.5">
        {list.map((e, i) => (
          <motion.div key={`${e.exercice}-${i}`} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <GripVertical className="size-4 shrink-0 text-ink-2/50" />
                <span className="w-6 text-center text-xs font-extrabold text-ink-2">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{e.exercice}</p>
                  {e.variante && <p className="mt-0.5 truncate text-xs text-ink-2">{e.variante}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Monter">
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="Descendre">
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-ink-2 hover:text-danger" onClick={() => remove(i)} aria-label="Retirer">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-[5rem_6rem_5.5rem_1fr] items-center gap-2 border-t border-line/50 pt-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase text-ink-2">Séries</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={e.series}
                    onChange={(ev) => patch(i, { series: Math.max(1, Number(ev.target.value) || 1) })}
                    className="h-8 w-12 rounded-lg border border-line bg-bg-2 text-center text-sm font-bold focus:border-accent/60 focus:outline-none"
                  />
                </div>
                <input
                  value={e.repsCible ?? ''}
                  onChange={(ev) => patch(i, { repsCible: ev.target.value || null })}
                  placeholder="8-12"
                  aria-label="Répétitions cibles"
                  className="h-8 rounded-lg border border-line bg-bg-2 px-2 text-center text-sm font-semibold focus:border-accent/60 focus:outline-none"
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={3600}
                    value={e.reposSec ?? ''}
                    onChange={(ev) =>
                      patch(i, { reposSec: ev.target.value === '' ? null : Math.max(0, Number(ev.target.value)) })
                    }
                    placeholder="—"
                    aria-label="Repos en secondes"
                    title="Repos entre séries (s) — vide = défaut des paramètres"
                    className="h-8 w-12 rounded-lg border border-line bg-bg-2 px-1 text-center text-sm font-semibold focus:border-accent/60 focus:outline-none"
                  />
                  <span className="text-[10px] font-bold uppercase text-ink-2">repos</span>
                </div>
                <input
                  value={e.variante ?? ''}
                  onChange={(ev) => patch(i, { variante: ev.target.value || null })}
                  placeholder="Variante / réglage…"
                  aria-label="Variante"
                  className="h-8 min-w-0 rounded-lg border border-line bg-bg-2 px-2 text-xs text-ink-2 focus:border-accent/60 focus:outline-none"
                />
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Ajout d'exercice depuis la bibliothèque */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary" className="mt-4 w-full" size="lg">
            <Plus className="size-5" /> Ajouter un exercice
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[80dvh]">
          <DialogTitle>Ajouter un exercice</DialogTitle>
          <DialogDescription>Depuis la bibliothèque de l'onglet Liste.</DialogDescription>
          <div className="mt-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-2" />
              <Input className="pl-9" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
            </div>
            <Select value={muscle} onValueChange={setMuscle}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {muscles.map((m) => (
                  <SelectItem key={m} value={m}>{m === 'tous' ? 'Tous' : m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-3 max-h-80 space-y-1 overflow-y-auto scrollbar-thin">
            {filtered.map((e) => {
              const already = list.some((x) => x.exercice === e.nom);
              return (
                <button
                  key={e.nom}
                  disabled={already}
                  onClick={() => {
                    mutate((l) => [...l, { exercice: e.nom, series: 3, repsCible: '8-12', variante: null, notes: null, reposSec: null }]);
                    toast.success(`${e.nom} ajouté`);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors',
                    already ? 'cursor-default opacity-40' : 'hover:bg-line/50',
                  )}
                >
                  <span className="truncate">{e.nom}</span>
                  {already ? <Check className="size-4 shrink-0 text-success" /> : <Badge tone="violet">{e.muscle}</Badge>}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {dirty && (
        <p className="mt-4 flex items-center gap-2 text-xs text-warn">
          <ChevronRight className="size-3.5" /> Modifications non enregistrées
        </p>
      )}
    </div>
  );
}
