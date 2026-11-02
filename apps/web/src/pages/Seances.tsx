import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Archive, Clock, Copy, Dumbbell, History, Play, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useArchiveProgramme, useDuplicateProgramme, useProgrammes, useSeances } from '@/hooks/queries';
import { formatDuration, formatShort, sessionCount } from '@/lib/session-utils';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, EmptyState, Skeleton } from '@/components/ui/misc';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useSaveProgramme } from '@/hooks/queries';
import { useState } from 'react';
import { ApiError } from '@/lib/api';

export function SeancesPage() {
  const { data: programmes, isLoading } = useProgrammes();
  const { data: seances } = useSeances();
  const navigate = useNavigate();
  const [newName, setNewName] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const save = useSaveProgramme();

  const actifs = (programmes ?? []).filter((p) => p.statut === 'actif');
  const archives = (programmes ?? []).filter((p) => p.statut === 'archive');

  const create = async () => {
    try {
      const p = await save.mutateAsync({ nom: newName.trim() || 'Nouveau programme', exercices: [] });
      setDialogOpen(false);
      setNewName('');
      navigate(`/programmes/${p.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Création impossible');
    }
  };

  return (
    <div>
      <PageHeader
        title="Séances"
        subtitle="Programmes et historique d'entraînement"
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" /> Nouveau
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>Nouveau programme</DialogTitle>
              <DialogDescription>Donnez un nom, puis composez vos exercices.</DialogDescription>
              <Input
                className="mt-4"
                placeholder="Ex. Push / Pull / Legs…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
              <DialogFooter>
                <Button onClick={create} loading={save.isPending}>
                  Créer
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <section className="space-y-3">
        {isLoading && [1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        {!isLoading && actifs.length === 0 && (
          <EmptyState
            icon={<Dumbbell className="size-6" />}
            title="Aucun programme actif"
            description="Créez un programme pour commencer à suivre vos séances."
          />
        )}
        {actifs.map((p, i) => (
          <ProgrammeCard key={p.id} program={p} index={i} />
        ))}
        {archives.map((p, i) => (
          <ProgrammeCard key={p.id} program={p} index={i} archived />
        ))}
      </section>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-4" /> Historique des séances
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-line/60 p-0 px-5 pb-3">
          {(seances ?? []).length === 0 && (
            <p className="py-6 text-center text-sm text-ink-2">Aucune séance enregistrée pour l'instant.</p>
          )}
          {(seances ?? []).map((s) => (
            <Link key={s.id} to={`/seances/${s.id}`} className="flex items-center justify-between py-3.5 transition-opacity hover:opacity-80">
              <div>
                <p className="text-sm font-bold">{s.programmeNom}</p>
                <p className="text-xs text-ink-2">
                  {formatShort(s.date)} · {s.exercices.filter((e) => !e.passee).length} exercices ·{' '}
                  {formatDuration(s.dureeSec)}
                </p>
              </div>
              <Badge tone={s.statut === 'terminee' ? 'success' : 'warn'}>
                {s.statut === 'terminee' ? 'Terminée' : 'Abandonnée'}
              </Badge>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ProgrammeCard({ program: p, index, archived }: { program: import('@suivi/shared').Program; index: number; archived?: boolean }) {
  const dup = useDuplicateProgramme();
  const arch = useArchiveProgramme();
  const navigate = useNavigate();
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
      <Card className={archived ? 'opacity-55' : ''}>
        <CardContent className="flex items-center gap-4 p-5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-violet-soft text-violet">
            <Dumbbell className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-extrabold">
              {p.nom} {archived && <Badge tone="default">Archivé</Badge>}
            </p>
            <p className="mt-0.5 text-sm text-ink-2">
              {p.exercices.length} exercices · {sessionCount(p)} séries
            </p>
          </div>
          {!archived && (
            <Button
              size="lg"
              onClick={() => navigate(`/seance-active?programme=${p.id}`)}
            >
              <Play className="size-5" fill="currentColor" />
              <span className="hidden sm:inline">Commencer</span>
            </Button>
          )}
        </CardContent>
        <div className="flex items-center gap-1 border-t border-line/60 px-3 py-1.5">
          <Button asChild variant="ghost" size="sm">
            <Link to={`/programmes/${p.id}`}>Gérer</Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => dup.mutateAsync(p.id).then(() => toast.success('Programme dupliqué'))} disabled={dup.isPending}>
            <Copy className="size-3.5" /> Dupliquer
          </Button>
          {!archived && (
            <Button
              variant="ghost"
              size="sm"
              className="text-ink-2 hover:text-danger"
              onClick={() => arch.mutateAsync(p.id).then(() => toast.success('Programme archivé'))}
              disabled={arch.isPending}
            >
              <Archive className="size-3.5" /> Archiver
            </Button>
          )}
          <span className="ml-auto flex items-center gap-1 pr-2 text-[11px] text-ink-2">
            <Clock className="size-3" /> ~{Math.round(sessionCount(p) * 3.5 + 10)} min
          </span>
        </div>
      </Card>
    </motion.div>
  );
}
