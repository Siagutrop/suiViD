// Section « Aliments du jour » du Journal — recherche unifiée :
// bibliothèque du coach d'abord, puis Open Food Facts (texte ou
// code-barres). Un produit en ligne ajouté au journal est enregistré
// dans la bibliothèque pour être réutilisé par tous.
// Fonctionnalité SQLite : masquée silencieusement hors mode sqlite.

import { useEffect, useMemo, useState } from 'react';
import { Apple, ArrowLeft, ArrowUpFromLine, Globe, Loader2, PenLine, Plus, Repeat, ScanBarcode, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Aliment, AlimentExterne, JournalAliment } from '@suivi/shared';
import {
  useAddAlimentExterne,
  useAddJournalAliment,
  useAliments,
  useDeleteJournalAliment,
  useJournalAliments,
  useRechercheAliments,
  useUpdateJournalAliment,
} from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/misc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { TableEquivalences } from '@/components/TableEquivalences';

type Selection = { type: 'local'; a: Aliment } | { type: 'off'; a: AlimentExterne };

const QTY_PRESETS = [50, 100, 150, 200, 250];

export function JournalAliments({
  date,
  onReport,
}: {
  date: string;
  /** Remplit les champs calories/macros du formulaire avec les totaux. */
  onReport: (t: { calories: number; proteines: number; glucides: number; lipides: number }) => void;
}) {
  const { data: aliments } = useAliments();
  const { data: lignes, isError } = useJournalAliments(date);
  const add = useAddJournalAliment(date);
  const addExterne = useAddAlimentExterne(date);
  const update = useUpdateJournalAliment(date);
  const del = useDeleteJournalAliment(date);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sel, setSel] = useState<Selection | null>(null);
  const [qty, setQty] = useState('');
  const [scan, setScan] = useState(false);
  const [equivOpen, setEquivOpen] = useState(false);
  const [editLigne, setEditLigne] = useState<JournalAliment | null>(null);
  const [editQty, setEditQty] = useState('');
  const { data: recherche, isFetching } = useRechercheAliments(debounced);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const locaux = useMemo(() => {
    if (debounced.trim().length >= 2) return recherche?.locaux ?? [];
    return (aliments ?? []).slice(0, 12);
  }, [debounced, recherche, aliments]);
  const enLigne = debounced.trim().length >= 2 ? (recherche?.enLigne ?? []) : [];

  // Scan d'un code-barres → le lookup renvoie 1 produit → sélection auto.
  useEffect(() => {
    if (sel || !/^\d{8,14}$/.test(debounced.trim()) || isFetching) return;
    if (enLigne[0]) setSel({ type: 'off', a: enLigne[0] });
    else if (locaux[0]) setSel({ type: 'local', a: locaux[0] });
  }, [recherche, isFetching, debounced, sel, enLigne, locaux]);

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

  // Indisponible hors SQLite (400)
  if (isError) return null;

  const reset = () => {
    setSel(null);
    setQty('');
    setQ('');
    setDebounced('');
    setScan(false);
  };

  const submit = async () => {
    if (!sel || !(Number(qty) > 0)) return;
    try {
      if (sel.type === 'local') {
        await add.mutateAsync({ alimentId: sel.a.id, quantiteG: Number(qty) });
      } else {
        const a = sel.a;
        await addExterne.mutateAsync({
          nom: a.nom,
          marque: a.marque,
          codeBarre: a.codeBarre,
          kcal: a.kcal,
          proteines: a.proteines,
          glucides: a.glucides,
          lipides: a.lipides,
          quantiteG: Number(qty),
        });
      }
      setOpen(false);
      reset();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Ajout impossible');
    }
  };

  const pending = add.isPending || addExterne.isPending;

  return (
    <Card className="mt-5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Apple className="size-4 text-success" /> Aliments du jour
        </CardTitle>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setEquivOpen(true)} title="Table d'équivalences">
            <Repeat className="size-4" /> <span className="hidden sm:inline">Équivalences</span>
          </Button>
          <Dialog
            open={open}
            onOpenChange={(o) => {
              setOpen(o);
              if (!o) reset();
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" variant="secondary">
                <Plus className="size-4" /> Ajouter
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogTitle>Ajouter un aliment</DialogTitle>
            <DialogDescription>
              Cherche dans ta bibliothèque ou en ligne — un nom (« poulet », « skyr ») ou un code-barres.
            </DialogDescription>
            {scan ? (
              <div className="mt-4">
                <BarcodeScanner
                  onDetect={(code) => {
                    setScan(false);
                    setQ(code);
                    setDebounced(code);
                  }}
                  onClose={() => setScan(false)}
                />
              </div>
            ) : sel ? (
              <div className="mt-4 space-y-3">
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs font-semibold text-ink-2 hover:text-ink"
                  onClick={() => setSel(null)}
                >
                  <ArrowLeft className="size-3.5" /> Retour aux résultats
                </button>
                <div className="rounded-xl bg-bg-2/60 px-3 py-2.5">
                  <p className="truncate text-sm font-bold">
                    {sel.a.nom}
                    {sel.type === 'off' && sel.a.marque && <span className="font-normal text-ink-2"> · {sel.a.marque}</span>}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-2">
                    {sel.a.kcal} kcal · P{sel.a.proteines} G{sel.a.glucides} L{sel.a.lipides} /100 g
                  </p>
                </div>
                <QtyField qty={qty} setQty={setQty} autoFocus />
                {Number(qty) > 0 && <Preview aliment={sel.a} qty={Number(qty)} />}
                {sel.type === 'off' && (
                  <p className="text-[11px] text-ink-2">Sera enregistré dans ta bibliothèque pour les prochaines fois.</p>
                )}
                <Button className="w-full" onClick={submit} loading={pending} disabled={!(Number(qty) > 0)}>
                  Ajouter au journal
                </Button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Rechercher ou taper un code-barres…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    autoFocus
                  />
                  <Button type="button" variant="secondary" onClick={() => setScan(true)} title="Scanner un code-barres">
                    <ScanBarcode className="size-4" />
                  </Button>
                </div>
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {debounced.trim().length < 2 && locaux.length > 0 && (
                    <p className="px-1 pb-1 text-[11px] font-bold uppercase tracking-wide text-ink-2">Ta bibliothèque</p>
                  )}
                  {locaux.map((a) => (
                    <ResultRow
                      key={a.id}
                      nom={a.nom}
                      badge="Bibliothèque"
                      kcal={a.kcal}
                      p={a.proteines}
                      g={a.glucides}
                      l={a.lipides}
                      onPick={() => setSel({ type: 'local', a })}
                    />
                  ))}
                  {enLigne.length > 0 && (
                    <p className="flex items-center gap-1 px-1 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-ink-2">
                      <Globe className="size-3" /> En ligne — Open Food Facts
                    </p>
                  )}
                  {enLigne.map((a) => (
                    <ResultRow
                      key={`${a.codeBarre ?? a.nom}|${a.marque ?? ''}`}
                      nom={a.marque ? `${a.nom} (${a.marque})` : a.nom}
                      badge="OFF"
                      kcal={a.kcal}
                      p={a.proteines}
                      g={a.glucides}
                      l={a.lipides}
                      onPick={() => setSel({ type: 'off', a })}
                    />
                  ))}
                  {isFetching && debounced.trim().length >= 2 && (
                    <p className="flex items-center justify-center gap-2 py-4 text-xs text-ink-2">
                      <Loader2 className="size-4 animate-spin" /> Recherche en ligne…
                    </p>
                  )}
                  {!isFetching && debounced.trim().length >= 2 && locaux.length === 0 && enLigne.length === 0 && (
                    <p className="py-4 text-center text-xs text-ink-2">Aucun résultat — essaie un autre nom ou un code-barres.</p>
                  )}
                  {debounced.trim().length < 2 && locaux.length === 0 && (
                    <p className="py-4 text-center text-xs text-ink-2">Tape au moins 2 caractères pour chercher.</p>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {!(lignes?.length ?? 0) && (
          <p className="text-sm text-ink-2">Aucun aliment saisi — ajoute ce que tu manges pour calculer tes macros.</p>
        )}
        <div className="space-y-1.5">
          {(lignes ?? []).map((l) => (
            <div key={l.id} className="flex items-center gap-3 rounded-xl bg-bg-2/50 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{l.nom}</p>
                <p className="text-[11px] text-ink-2">
                  {l.quantiteG} g · P{l.proteines} G{l.glucides} L{l.lipides}
                </p>
              </div>
              <span className="shrink-0 text-xs font-extrabold">{l.kcal} kcal</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-ink-2 hover:text-ink"
                onClick={() => {
                  setEditLigne(l);
                  setEditQty(String(l.quantiteG));
                }}
                aria-label="Modifier la quantité"
              >
                <PenLine className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-ink-2 hover:text-danger"
                onClick={() => del.mutate(l.id)}
                aria-label="Retirer"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
        {(lignes?.length ?? 0) > 0 && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-accent/25 bg-accent/5 px-3 py-2.5">
            <p className="text-xs font-bold">
              Total : {totals.calories} kcal · P{totals.proteines} G{totals.glucides} L{totals.lipides}
            </p>
            <Button size="sm" variant="ghost" onClick={() => onReport(totals)} title="Remplit les champs du formulaire">
              <ArrowUpFromLine className="size-3.5" /> Reporter
            </Button>
          </div>
        )}
      </CardContent>

      {/* Table d'équivalences nutritionnelles */}
      <Dialog open={equivOpen} onOpenChange={setEquivOpen}>
        <DialogContent>
          <DialogTitle>Table d'équivalences</DialogTitle>
          <DialogDescription>
            Quel grammage d'un autre aliment apporte le même macro ? Choisis la référence et la quantité.
          </DialogDescription>
          <TableEquivalences aliments={aliments ?? []} />
        </DialogContent>
      </Dialog>

      {/* Modification de la quantité d'une ligne */}
      <Dialog open={!!editLigne} onOpenChange={(o) => !o && setEditLigne(null)}>
        <DialogContent>
          <DialogTitle>Modifier la quantité</DialogTitle>
          <DialogDescription>{editLigne?.nom}</DialogDescription>
          <div className="mt-4 space-y-3">
            <QtyField qty={editQty} setQty={setEditQty} autoFocus />
            <Button
              className="w-full"
              loading={update.isPending}
              disabled={!(Number(editQty) > 0)}
              onClick={async () => {
                try {
                  await update.mutateAsync({ id: editLigne!.id, quantiteG: Number(editQty) });
                  setEditLigne(null);
                } catch (e) {
                  toast.error(e instanceof ApiError ? e.message : 'Modification impossible');
                }
              }}
            >
              Mettre à jour
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ResultRow({
  nom,
  badge,
  kcal,
  p,
  g,
  l,
  onPick,
}: {
  nom: string;
  badge: string;
  kcal: number;
  p: number;
  g: number;
  l: number;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-bg-2/70"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{nom}</p>
        <p className="text-[11px] text-ink-2">
          {kcal} kcal · P{p} G{g} L{l} /100 g
        </p>
      </div>
      <Badge tone={badge === 'OFF' ? 'violet' : 'accent'} className="shrink-0">
        {badge}
      </Badge>
    </button>
  );
}

/** Quantité : chips de présélection + champ libre. */
function QtyField({
  qty,
  setQty,
  autoFocus,
}: {
  qty: string;
  setQty: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {QTY_PRESETS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setQty(String(g))}
            className={cn(
              'rounded-full px-3 py-1 text-[11px] font-bold transition-colors',
              Number(qty) === g ? 'bg-accent text-bg' : 'bg-bg-2/70 text-ink-2 hover:text-ink',
            )}
          >
            {g} g
          </button>
        ))}
      </div>
      <Input
        type="number"
        min={1}
        max={5000}
        suffix="g"
        placeholder="Quantité (g)"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        autoFocus={autoFocus}
      />
    </div>
  );
}

function Preview({ aliment, qty }: { aliment: { kcal: number; proteines: number; glucides: number; lipides: number }; qty: number }) {
  const f = qty / 100;
  return (
    <p className="rounded-xl bg-bg-2/60 px-3 py-2 text-xs text-ink-2">
      → {Math.round(aliment.kcal * f)} kcal · P{Math.round(aliment.proteines * f * 10) / 10} · G
      {Math.round(aliment.glucides * f * 10) / 10} · L{Math.round(aliment.lipides * f * 10) / 10}
    </p>
  );
}
