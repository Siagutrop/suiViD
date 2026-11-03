import { useMemo, useState } from 'react';
import { Apple, PenLine, Plus, Search, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { Aliment } from '@suivi/shared';
import {
  useAdminAliments,
  useAdminDeleteAliment,
  useAdminImportAliments,
  useAdminSaveAliment,
} from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { AdminSubNav } from '@/components/admin/AdminSubNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, Skeleton } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

type Draft = Omit<Aliment, 'id'> & { id?: string };

const EMPTY: Draft = { nom: '', kcal: 0, proteines: 0, glucides: 0, lipides: 0, groupe: null };

export function AdminAlimentsPage() {
  const { data: aliments, isLoading } = useAdminAliments();
  const save = useAdminSaveAliment();
  const del = useAdminDeleteAliment();
  const importCsv = useAdminImportAliments();
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [open, setOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Aliment | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [csv, setCsv] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (aliments ?? []).filter((a) => !q || a.nom.toLowerCase().includes(q));
  }, [aliments, search]);

  const submit = async () => {
    try {
      await save.mutateAsync(draft);
      toast.success('Aliment enregistré');
      setOpen(false);
      setDraft(EMPTY);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Enregistrement impossible');
    }
  };

  const num = (v: string) => Math.max(0, Number(v.replace(',', '.')) || 0);

  // Familles déjà utilisées — suggestions pour la saisie du groupe.
  const groupes = useMemo(
    () => [...new Set((aliments ?? []).map((a) => a.groupe).filter((g): g is string => !!g))].sort(),
    [aliments],
  );

  return (
    <div>
      <PageHeader title="Espace coach" subtitle="Bibliothèque d'aliments — macros pour 100 g" />
      <AdminSubNav />

      <Card>
        <CardContent className="pt-5">
          <div className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-2" />
              <Input className="pl-9" placeholder="Rechercher un aliment…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) setCsv(''); }}>
              <DialogTrigger asChild>
                <Button variant="secondary">
                  <Upload className="size-4" /> <span className="hidden sm:inline">Importer</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>Importer des aliments</DialogTitle>
                <DialogDescription>
                  Colle un CSV — une ligne par aliment : <code>nom ; kcal ; protéines ; glucides ; lipides</code> (pour
                  100 g). Compatible avec un export CIQUAL/ANSES. Les doublons de nom sont ignorés.
                </DialogDescription>
                <div className="mt-4 space-y-3">
                  <textarea
                    className="min-h-40 w-full rounded-xl border border-line bg-bg-2/60 px-3 py-2 font-mono text-xs outline-none focus:border-accent"
                    placeholder={'nom;kcal;proteines;glucides;lipides\nBlanc de poulet cru;121;22;0;2.6\nRiz blanc cuit;130;2.7;28;0.3'}
                    value={csv}
                    onChange={(e) => setCsv(e.target.value)}
                  />
                  <Button
                    className="w-full"
                    loading={importCsv.isPending}
                    disabled={!csv.trim()}
                    onClick={async () => {
                      try {
                        const r = await importCsv.mutateAsync(csv);
                        toast.success(`${r.ajoutes} aliment(s) importé(s)${r.ignores ? ` — ${r.ignores} ignoré(s)` : ''}`);
                        setImportOpen(false);
                        setCsv('');
                      } catch (e) {
                        toast.error(e instanceof ApiError ? e.message : 'Import impossible');
                      }
                    }}
                  >
                    Importer
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setDraft(EMPTY); }}>
              <DialogTrigger asChild>
                <Button onClick={() => setDraft(EMPTY)}>
                  <Plus className="size-4" /> <span className="hidden sm:inline">Ajouter</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>{draft.id ? 'Modifier' : 'Nouvel'} aliment</DialogTitle>
                <DialogDescription>Valeurs nutritionnelles pour 100 g.</DialogDescription>
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-ink-2">Nom</label>
                    <Input value={draft.nom} onChange={(e) => setDraft({ ...draft, nom: e.target.value })} placeholder="Blanc de poulet…" />
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {([
                      ['kcal', 'kcal'],
                      ['proteines', 'Protéines'],
                      ['glucides', 'Glucides'],
                      ['lipides', 'Lipides'],
                    ] as const).map(([key, label]) => (
                      <div key={key}>
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-2">{label}</label>
                        <Input
                          type="number"
                          min={0}
                          step="0.1"
                          value={draft[key] || ''}
                          onChange={(e) => setDraft({ ...draft, [key]: num(e.target.value) })}
                        />
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-ink-2">
                      Famille d'équivalence
                    </label>
                    <Input
                      list="groupes-aliments"
                      value={draft.groupe ?? ''}
                      onChange={(e) => setDraft({ ...draft, groupe: e.target.value.trim() || null })}
                      placeholder="Féculents, Protéines, Fruits…"
                    />
                    <datalist id="groupes-aliments">
                      {groupes.map((g) => (
                        <option key={g} value={g} />
                      ))}
                    </datalist>
                    <p className="mt-1 text-[11px] text-ink-2">
                      Aliments interchangeables dans la table d'équivalences du client.
                    </p>
                  </div>
                  <Button className="w-full" onClick={submit} loading={save.isPending} disabled={!draft.nom.trim()}>
                    Enregistrer
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {isLoading && [1, 2, 3].map((i) => <Skeleton key={i} className="mb-2 h-12 w-full" />)}
          {!isLoading && !filtered.length && (
            <EmptyState
              icon={<Apple className="size-6" />}
              title="Aucun aliment"
              description="Ajoute les aliments de référence — les clients pourront les saisir dans leur journal."
            />
          )}
          {/* Desktop : tableau */}
          <div className="hidden lg:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line/60 text-[10px] font-bold uppercase tracking-wider text-ink-2">
                  <th className="pb-2 pr-4">Aliment</th>
                  <th className="pb-2 pr-4">Famille</th>
                  <th className="pb-2 pr-4">Kcal</th>
                  <th className="pb-2 pr-4">Protéines</th>
                  <th className="pb-2 pr-4">Glucides</th>
                  <th className="pb-2 pr-4">Lipides</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="border-b border-line/30 transition-colors last:border-0 hover:bg-bg-2/70">
                    <td className="py-2.5 pr-4 font-bold">
                      {a.nom}
                      {a.source === 'off' && <Badge tone="violet" className="ml-2">OFF</Badge>}
                      {a.source === 'import' && <Badge tone="default" className="ml-2">import</Badge>}
                    </td>
                    <td className="py-2.5 pr-4 text-ink-2">{a.groupe ?? '—'}</td>
                    <td className="py-2.5 pr-4">{a.kcal}</td>
                    <td className="py-2.5 pr-4">{a.proteines} g</td>
                    <td className="py-2.5 pr-4">{a.glucides} g</td>
                    <td className="py-2.5 pr-4">{a.lipides} g</td>
                    <td className="py-2.5 text-right">
                      <div className="inline-flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setDraft({ ...a }); setOpen(true); }} aria-label="Modifier">
                          <PenLine className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-ink-2 hover:text-danger" onClick={() => setConfirmDel(a)} aria-label="Supprimer">
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
            {filtered.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-xl bg-bg-2/50 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">
                    {a.nom}
                    {a.source === 'off' && <Badge tone="violet" className="ml-1.5">OFF</Badge>}
                  </p>
                  <p className="text-[11px] text-ink-2">
                    {a.kcal} kcal · P{a.proteines} G{a.glucides} L{a.lipides} <span className="opacity-60">/100 g</span>
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setDraft({ ...a }); setOpen(true); }} aria-label="Modifier">
                  <PenLine className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-ink-2 hover:text-danger" onClick={() => setConfirmDel(a)} aria-label="Supprimer">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <DialogContent>
          <DialogTitle>Supprimer « {confirmDel?.nom} » ?</DialogTitle>
          <DialogDescription>Les lignes de journal qui l'utilisent seront aussi supprimées.</DialogDescription>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmDel(null)}>Annuler</Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={async () => {
                try {
                  await del.mutateAsync(confirmDel!.id);
                  toast.success('Aliment supprimé');
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
