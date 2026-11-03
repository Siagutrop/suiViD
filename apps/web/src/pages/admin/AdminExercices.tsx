import { useMemo, useState } from 'react';
import { Dumbbell, PenLine, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useAdminDeleteExercice,
  useAdminExercices,
  useAdminSaveExercice,
} from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { AdminSubNav } from '@/components/admin/AdminSubNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, Skeleton } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface Exo {
  /** Nom d'origine quand on renomme un exercice existant. */
  originalNom?: string;
  nom: string;
  muscle: string;
  videoUrl: string;
}

export function AdminExercicesPage() {
  const { data: exos, isLoading } = useAdminExercices();
  const save = useAdminSaveExercice();
  const del = useAdminDeleteExercice();
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<Exo | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (exos ?? []).filter((e) => !q || e.nom.toLowerCase().includes(q) || e.muscle.toLowerCase().includes(q));
  }, [exos, search]);

  const submit = async () => {
    if (!edit) return;
    try {
      await save.mutateAsync(edit);
      toast.success('Exercice enregistré');
      setOpen(false);
      setEdit(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Enregistrement impossible');
    }
  };

  return (
    <div>
      <PageHeader title="Espace coach" subtitle="Bibliothèque d'exercices — partagée par tous les clients" />
      <AdminSubNav />

      <Card>
        <CardContent className="pt-5">
          <div className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-2" />
              <Input className="pl-9" placeholder="Rechercher un exercice ou un muscle…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEdit(null); }}>
              <DialogTrigger asChild>
                <Button onClick={() => setEdit({ nom: '', muscle: '', videoUrl: '' })}>
                  <Plus className="size-4" /> <span className="hidden sm:inline">Ajouter</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>{edit?.nom ? 'Modifier' : 'Nouvel'} exercice</DialogTitle>
                <DialogDescription>Visible par tous les clients dans leur bibliothèque.</DialogDescription>
                {edit && (
                  <div className="mt-4 space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-ink-2">Nom</label>
                      <Input value={edit.nom} onChange={(e) => setEdit({ ...edit, nom: e.target.value })} placeholder="Développé couché…" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-ink-2">Muscle</label>
                      <Input value={edit.muscle} onChange={(e) => setEdit({ ...edit, muscle: e.target.value })} placeholder="Pectoraux, Dos, Biceps…" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-ink-2">Lien vidéo</label>
                      <Input value={edit.videoUrl} onChange={(e) => setEdit({ ...edit, videoUrl: e.target.value })} placeholder="https://youtube.com/…" />
                    </div>
                    <Button className="w-full" onClick={submit} loading={save.isPending} disabled={!edit.nom.trim() || !edit.muscle.trim()}>
                      Enregistrer
                    </Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>

          {isLoading && [1, 2, 3].map((i) => <Skeleton key={i} className="mb-2 h-12 w-full" />)}
          {!isLoading && !filtered.length && (
            <EmptyState icon={<Dumbbell className="size-6" />} title="Aucun exercice" description="La bibliothèque est vide ou le filtre ne correspond à rien." />
          )}
          {/* Desktop : tableau */}
          <div className="hidden lg:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line/60 text-[10px] font-bold uppercase tracking-wider text-ink-2">
                  <th className="pb-2 pr-4">Exercice</th>
                  <th className="pb-2 pr-4">Muscle</th>
                  <th className="pb-2 pr-4">Vidéo</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.nom} className="border-b border-line/30 transition-colors last:border-0 hover:bg-bg-2/70">
                    <td className="py-2.5 pr-4 font-bold">{e.nom}</td>
                    <td className="py-2.5 pr-4"><Badge tone="violet">{e.muscle}</Badge></td>
                    <td className="max-w-[280px] truncate py-2.5 pr-4 text-xs text-ink-2">
                      {e.videoUrl ? (
                        <a href={e.videoUrl} target="_blank" rel="noreferrer" className="hover:text-accent hover:underline">{e.videoUrl}</a>
                      ) : '—'}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="inline-flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEdit({ originalNom: e.nom, nom: e.nom, muscle: e.muscle, videoUrl: e.videoUrl ?? '' }); setOpen(true); }} aria-label="Modifier">
                          <PenLine className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-ink-2 hover:text-danger" onClick={() => setConfirmDel(e.nom)} aria-label="Supprimer">
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile : lignes empilées */}
          <div className="space-y-1.5 lg:hidden">
            {filtered.map((e) => (
              <div key={e.nom} className="flex items-center gap-3 rounded-xl bg-bg-2/50 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{e.nom}</p>
                  {e.videoUrl && <p className="truncate text-[11px] text-ink-2">{e.videoUrl}</p>}
                </div>
                <Badge tone="violet">{e.muscle}</Badge>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEdit({ originalNom: e.nom, nom: e.nom, muscle: e.muscle, videoUrl: e.videoUrl ?? '' }); setOpen(true); }} aria-label="Modifier">
                  <PenLine className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-ink-2 hover:text-danger" onClick={() => setConfirmDel(e.nom)} aria-label="Supprimer">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Confirmation suppression */}
      <Dialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <DialogContent>
          <DialogTitle>Supprimer « {confirmDel} » ?</DialogTitle>
          <DialogDescription>
            L'exercice disparaît de la bibliothèque pour tous les clients. Les séances déjà enregistrées gardent leur historique.
          </DialogDescription>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmDel(null)}>Annuler</Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={async () => {
                try {
                  await del.mutateAsync(confirmDel!);
                  toast.success('Exercice supprimé');
                } catch (e) {
                  toast.error(e instanceof ApiError ? e.message : 'Suppression impossible');
                }
                setConfirmDel(null);
              }}
            >
              Supprimer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
