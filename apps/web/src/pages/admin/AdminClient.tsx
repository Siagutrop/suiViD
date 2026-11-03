import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowLeft,
  BedDouble,
  Camera,
  ChevronDown,
  Copy,
  Download,
  Dumbbell,
  Flame,
  KeyRound,
  NotebookPen,
  MessageSquareText,
  PenLine,
  Plus,
  Scale,
  Send,
  Settings2,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
  Footprints,
  Trash2,
  Utensils,
} from 'lucide-react';
import { toast } from 'sonner';
import type { JournalEntry, JournalValues, Photo, Session, UserSettings } from '@suivi/shared';
import { addDays, JOURNAL_FIELDS, seriesByDay, movingAverage, todayInTimezone } from '@suivi/shared';
import {
  useAdminAddCommentaire,
  useAdminAddJournalAliment,
  useAdminAliments,
  useAdminChampValeurs,
  useAdminChamps,
  useAdminCommentaires,
  useAdminCopierProgramme,
  useAdminDeleteChamp,
  useAdminDeleteCommentaire,
  useAdminDeletePhoto,
  useAdminDeleteSeance,
  useAdminJournalAliments,
  useAdminJournalRange,
  useAdminOverview,
  useAdminPatchUser,
  useAdminRemoveJournalAliment,
  useAdminSaveChamp,
  useAdminSaveSettings,
  useAdminUpsertJournal,
  useAdminUsers,
  useSetChampValeur,
  type AdminUser,
} from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { cn, formatDateFr, formatShort } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';
import { PhotoCompareDialog } from '@/components/PhotoCompareDialog';
import { PhotoImg } from '@/components/PhotosTab';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, Skeleton } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const POSE_LABELS: Record<string, string> = { relache: 'relâché', contracte: 'contracté' };
const ANGLE_LABELS: Record<string, string> = {
  face: 'Face',
  'profil-droit': 'Profil D',
  'profil-gauche': 'Profil G',
  profil: 'Profil',
  dos: 'Dos',
};

const JOURNAL_FIELDS_UI: { key: keyof JournalValues; label: string; suffix?: string; num?: boolean }[] = [
  { key: 'sommeil', label: 'Sommeil', suffix: 'h', num: true },
  { key: 'forme', label: 'Forme', suffix: '/10', num: true },
  { key: 'poids', label: 'Poids', suffix: 'kg', num: true },
  { key: 'calories', label: 'Calories', suffix: 'kcal', num: true },
  { key: 'proteines', label: 'Protéines', suffix: 'g', num: true },
  { key: 'glucides', label: 'Glucides', suffix: 'g', num: true },
  { key: 'lipides', label: 'Lipides', suffix: 'g', num: true },
  { key: 'pas', label: 'Pas', num: true },
];

export function AdminClientPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useAdminOverview(id!);
  const { data: users } = useAdminUsers(true);
  const client = users?.find((u) => u.id === id);
  const photoBase = `/api/admin/users/${id}/photos`;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [journalEdit, setJournalEdit] = useState<JournalEntry | 'new' | null>(null);
  const [openSeance, setOpenSeance] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'seance' | 'photo'; id: string; label: string } | null>(null);
  const [journalJours, setJournalJours] = useState<30 | 90 | 0>(30); // 0 = tout
  const [copierProg, setCopierProg] = useState<{ id: string; nom: string } | null>(null);
  const [photoSelect, setPhotoSelect] = useState<Photo | null>(null);
  const [compare, setCompare] = useState<{ avant: Photo; apres: Photo } | null>(null);

  const delSeance = useAdminDeleteSeance(id!);
  const delPhoto = useAdminDeletePhoto(id!);
  const { data: journalHisto } = useAdminJournalRange(id!, null, null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-56" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
      </div>
    );
  }
  if (!data) return null;

  const today = todayInTimezone();
  // Historique complet (plage libre) + repli sur l'aperçu 30 j.
  // Ligne « remplie » = au moins un champ de suivi renseigné.
  const journalAll = (journalHisto ?? [...data.journal].reverse()).filter((j) =>
    JOURNAL_FIELDS.some((k) => j[k] != null),
  );
  const journal = journalAll
    .filter((j) => journalJours === 0 || j.date >= addDays(today, -journalJours))
    .sort((a, b) => b.date.localeCompare(a.date));
  const lastPoids = [...data.journal].reverse().find((j) => j.poids != null)?.poids;

  const exportCsv = () => {
    const head = 'date;sommeil_h;forme;poids_kg;calories_kcal;proteines_g;glucides_g;lipides_g;pas;entrainement';
    const rows = [...journal]
      .reverse()
      .map((j) =>
        [
          j.date,
          j.sommeil ?? '',
          j.forme ?? '',
          j.poids ?? '',
          j.calories ?? '',
          j.proteines ?? '',
          j.glucides ?? '',
          j.lipides ?? '',
          j.pas ?? '',
          (j.entrainement ?? '').replace(/;/g, ','),
        ].join(';'),
      );
    const blob = new Blob(['﻿' + head + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `journal-${client?.email?.split('@')[0] ?? 'client'}-${today}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Sélection de 2 photos → comparateur avant/après (mêmes poses idéalement).
  const pickPhoto = (p: Photo) => {
    if (!photoSelect) {
      setPhotoSelect(p);
      toast.info('Choisis la deuxième photo à comparer');
      return;
    }
    if (photoSelect.id === p.id) {
      setPhotoSelect(null);
      return;
    }
    const [a, b] = [photoSelect, p].sort((x, y) => x.date.localeCompare(y.date));
    setCompare({ avant: a!, apres: b! });
    setPhotoSelect(null);
  };

  const runConfirm = async () => {
    if (!confirm) return;
    try {
      if (confirm.kind === 'seance') await delSeance.mutateAsync(confirm.id);
      else await delPhoto.mutateAsync(confirm.id);
      toast.success(confirm.kind === 'seance' ? 'Séance supprimée' : 'Photo supprimée');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Suppression impossible');
    }
    setConfirm(null);
  };

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon" className="-ml-2">
              <Link to="/admin/clients"><ArrowLeft className="size-5" /></Link>
            </Button>
            {client?.email ?? 'Suivi client'}
          </span>
        }
        subtitle="Vue coach — tout est modifiable"
      />

      {/* Master-detail : rail fixe à gauche sur desktop, empilé sur mobile */}
      <div className="lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start lg:gap-6">
        <aside className="space-y-4 lg:sticky lg:top-8">
          {client && <IdentityCard client={client} />}
          {data.settings && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="size-4 text-violet" /> Objectifs
                </CardTitle>
                <Button size="sm" variant="secondary" onClick={() => setSettingsOpen(true)}>
                  <PenLine className="size-4" /> Modifier
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <Stat label="Calories" value={data.settings.objectifCalories != null ? `${data.settings.objectifCalories}` : '—'} suffix="kcal" />
                  <Stat label="Protéines" value={data.settings.objectifProteines != null ? `${data.settings.objectifProteines}` : '—'} suffix="g" />
                  <Stat label="Glucides" value={data.settings.objectifGlucides != null ? `${data.settings.objectifGlucides}` : '—'} suffix="g" />
                  <Stat label="Lipides" value={data.settings.objectifLipides != null ? `${data.settings.objectifLipides}` : '—'} suffix="g" />
                  <Stat label="Pas" value={data.settings.objectifPas != null ? `${data.settings.objectifPas}` : '—'} />
                  <Stat label="Poids" value={lastPoids != null ? `${lastPoids}` : '—'} suffix="kg" />
                </div>
              </CardContent>
            </Card>
          )}
          {data.settings && <NoteCoachCard userId={id!} settings={data.settings} />}
        </aside>

        <div className="mt-4 min-w-0 space-y-4 lg:mt-0">
          {/* Tendances — mêmes courbes que le client voit dans Progrès */}
          <TendancesCard entries={journalAll} today={today} settings={data.settings} />

          {/* Programmes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Dumbbell className="size-4 text-accent" /> Programmes · {data.programmes.length}
              </CardTitle>
              <Button asChild size="sm" variant="secondary">
                <Link to={`/admin/clients/${id}/programmes/nouveau`}>
                  <Plus className="size-4" /> Nouveau
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {!data.programmes.length && <p className="text-sm text-ink-2">Aucun programme — crée-en un pour le client.</p>}
              <div className="space-y-2">
                {data.programmes.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-2xl border border-line/60 bg-bg-2/50 p-3.5 transition-colors hover:border-line"
                  >
                    <Link to={`/admin/clients/${id}/programmes/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{p.nom}</p>
                        <p className="text-[11px] text-ink-2">{p.exercices.length} exercices</p>
                      </div>
                      <Badge tone={p.statut === 'actif' ? 'accent' : 'default'}>{p.statut}</Badge>
                      <PenLine className="size-4 shrink-0 text-ink-2" />
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      title="Copier vers un autre client"
                      onClick={() => setCopierProg({ id: p.id, nom: p.nom })}
                    >
                      <Copy className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <ChampsCard userId={id!} />

          {/* Séances récentes — détail + suppression */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Dumbbell className="size-4 text-success" /> Séances récentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!data.seances.length && <p className="text-sm text-ink-2">Aucune séance enregistrée.</p>}
              <div className="space-y-1.5">
                {data.seances.slice(0, 8).map((s) => (
                  <SeanceRow
                    key={s.id}
                    seance={s}
                    open={openSeance === s.id}
                    onToggle={() => setOpenSeance(openSeance === s.id ? null : s.id)}
                    onDelete={() => setConfirm({ kind: 'seance', id: s.id, label: `${s.programmeNom} du ${formatDateFr(s.date)}` })}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Journal — tableau complet sur desktop, lignes empilées sur mobile */}
          <Card>
            <CardHeader className="flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2">
                <NotebookPen className="size-4 text-warn" /> Journal · {journal.length} jour{journal.length > 1 ? 's' : ''}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1 rounded-xl border border-line bg-bg-2 p-1">
                  {([30, 90, 0] as const).map((j) => (
                    <button
                      key={j}
                      onClick={() => setJournalJours(j)}
                      className={cn(
                        'rounded-lg px-2.5 py-1 text-xs font-bold transition-colors',
                        journalJours === j ? 'bg-accent text-on-accent' : 'text-ink-2 hover:text-ink',
                      )}
                    >
                      {j === 0 ? 'Tout' : `${j} j`}
                    </button>
                  ))}
                </div>
                <Button size="sm" variant="ghost" onClick={exportCsv} disabled={!journal.length} title="Exporter la période en CSV">
                  <Download className="size-4" /> CSV
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setJournalEdit('new')}>
                  <Plus className="size-4" /> Journée
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!journal.length && <p className="text-sm text-ink-2">Aucune saisie sur la période.</p>}

              {/* Version desktop : vrai tableau, un clic = éditer */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line/60 text-[10px] font-bold uppercase tracking-wider text-ink-2">
                      <th className="pb-2 pr-3">Date</th>
                      <th className="pb-2 pr-3">Poids</th>
                      <th className="pb-2 pr-3">Sommeil</th>
                      <th className="pb-2 pr-3">Forme</th>
                      <th className="pb-2 pr-3">Kcal</th>
                      <th className="pb-2 pr-3">P</th>
                      <th className="pb-2 pr-3">G</th>
                      <th className="pb-2 pr-3">L</th>
                      <th className="pb-2 pr-3">Pas</th>
                      <th className="pb-2 pr-3">Entraînement</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {journal.slice(0, 40).map((j) => (
                      <tr
                        key={j.date}
                        onClick={() => setJournalEdit(j)}
                        className="cursor-pointer border-b border-line/30 transition-colors last:border-0 hover:bg-bg-2/70"
                      >
                        <td className="py-2 pr-3 font-bold">{formatDateFr(j.date)}</td>
                        <td className="py-2 pr-3">{j.poids != null ? `${j.poids} kg` : '—'}</td>
                        <td className="py-2 pr-3">{j.sommeil ?? '—'}</td>
                        <td className="py-2 pr-3">{j.forme != null ? `${j.forme}/10` : '—'}</td>
                        <td className="py-2 pr-3 font-semibold">{j.calories ?? '—'}</td>
                        <td className="py-2 pr-3">{j.proteines ?? '—'}</td>
                        <td className="py-2 pr-3">{j.glucides ?? '—'}</td>
                        <td className="py-2 pr-3">{j.lipides ?? '—'}</td>
                        <td className="py-2 pr-3">{j.pas ?? '—'}</td>
                        <td className="max-w-[120px] truncate py-2 pr-3 text-ink-2">{j.entrainement ?? ''}</td>
                        <td className="py-2"><PenLine className="size-3.5 text-ink-2" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Version mobile : lignes compactes */}
              <div className="space-y-1.5 lg:hidden">
                {journal.slice(0, 20).map((j) => (
                  <button
                    key={j.date}
                    onClick={() => setJournalEdit(j)}
                    className="flex w-full items-center gap-3 rounded-xl bg-bg-2/50 px-3 py-2 text-left text-xs transition-colors hover:bg-bg-2"
                  >
                    <span className="w-20 shrink-0 font-bold text-ink-2">{formatDateFr(j.date)}</span>
                    <span className="flex flex-1 flex-wrap gap-x-3 gap-y-0.5">
                      {j.poids != null && <span className="inline-flex items-center gap-1"><Scale className="size-3 text-violet" />{j.poids} kg</span>}
                      {j.calories != null && <span className="inline-flex items-center gap-1"><Flame className="size-3 text-warn" />{j.calories} kcal</span>}
                      {j.sommeil != null && <span className="inline-flex items-center gap-1"><BedDouble className="size-3 text-violet" />{j.sommeil} h</span>}
                      {j.pas != null && <span className="inline-flex items-center gap-1"><Footprints className="size-3 text-accent" />{j.pas}</span>}
                      {j.forme != null && <span>forme {j.forme}/10</span>}
                    </span>
                    <PenLine className="size-3.5 shrink-0 text-ink-2" />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Photos */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="size-4 text-accent" /> Photos · {data.photos.length}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!data.photos.length && (
                <EmptyState icon={<Camera className="size-6" />} title="Aucune photo" description="Le client n'a pas encore envoyé de photos de progression." />
              )}
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
                {data.photos.map((p) => (
                  <figure
                    key={p.id}
                    onClick={() => pickPhoto(p)}
                    className={cn(
                      'group relative aspect-[3/4] cursor-pointer overflow-hidden rounded-2xl border-2 transition-colors',
                      photoSelect?.id === p.id ? 'border-accent' : 'border-transparent',
                    )}
                  >
                    <PhotoImg id={p.id} base={photoBase} alt={`${p.angle} ${p.date}`} className="size-full object-cover" />
                    <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg/90 to-transparent px-2 pb-1.5 pt-5 text-[10px] font-bold">
                      {ANGLE_LABELS[p.angle] ?? p.angle}
                      {p.pose ? ` — ${POSE_LABELS[p.pose] ?? p.pose}` : ''}
                      <span className="block font-semibold text-ink-2">{formatDateFr(p.date)}</span>
                    </figcaption>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirm({ kind: 'photo', id: p.id, label: `${ANGLE_LABELS[p.angle] ?? p.angle} du ${formatDateFr(p.date)}` });
                      }}
                      className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-bg/70 text-ink-2 opacity-0 backdrop-blur transition-opacity hover:text-danger group-hover:opacity-100 focus:opacity-100"
                      aria-label="Supprimer la photo"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </figure>
                ))}
              </div>
              {data.photos.length > 1 && (
                <p className="mt-2 text-[11px] text-ink-2">
                  Clique deux photos pour les comparer avant / après.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialogues */}
      {settingsOpen && data.settings && (
        <SettingsDialog userId={id!} settings={data.settings} onClose={() => setSettingsOpen(false)} />
      )}
      {journalEdit && (
        <JournalDialog
          userId={id!}
          entry={journalEdit === 'new' ? null : journalEdit}
          onClose={() => setJournalEdit(null)}
        />
      )}
      {compare && (
        <PhotoCompareDialog
          compare={compare}
          base={photoBase}
          onClose={() => setCompare(null)}
          onDelete={(p, done) => delPhoto.mutate(p.id, { onSuccess: done })}
        />
      )}
      {copierProg && (
        <CopierDialog deUserId={id!} prog={copierProg} users={users ?? []} onClose={() => setCopierProg(null)} />
      )}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogTitle>Supprimer ?</DialogTitle>
          <DialogDescription>{confirm?.label} — action irréversible.</DialogDescription>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirm(null)}>Annuler</Button>
            <Button variant="danger" className="flex-1" onClick={runConfirm} loading={delSeance.isPending || delPhoto.isPending}>
              Supprimer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ------------------------------------------------------------------
// Identité du client — rail gauche (compte, statut, actions)
// ------------------------------------------------------------------
function IdentityCard({ client }: { client: AdminUser }) {
  const patchUser = useAdminPatchUser();
  const [resetOpen, setResetOpen] = useState(false);
  const [newPass, setNewPass] = useState('');

  const submitReset = async () => {
    try {
      await patchUser.mutateAsync({ id: client.id, password: newPass });
      toast.success('Mot de passe réinitialisé');
      setResetOpen(false);
      setNewPass('');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Échec');
    }
  };

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent/15 text-lg font-extrabold text-accent">
            {client.email.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{client.email}</p>
            <p className="text-[11px] text-ink-2">Depuis le {formatDateFr(client.createdAt.slice(0, 10))}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <Badge tone={client.disabled ? 'danger' : 'success'}>{client.disabled ? 'désactivé' : 'actif'}</Badge>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Réinitialiser le mot de passe" onClick={() => setResetOpen(true)}>
              <KeyRound className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-8 w-8', client.disabled ? 'text-success' : 'text-ink-2 hover:text-danger')}
              title={client.disabled ? 'Réactiver' : 'Désactiver'}
              onClick={() => patchUser.mutate({ id: client.id, disabled: !client.disabled })}
            >
              {client.disabled ? <ShieldCheck className="size-4" /> : <ShieldOff className="size-4" />}
            </Button>
          </div>
        </div>
      </CardContent>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogTitle>Nouveau mot de passe</DialogTitle>
          <DialogDescription>Définis un mot de passe temporaire à transmettre au client.</DialogDescription>
          <div className="mt-4 space-y-3">
            <Input type="text" placeholder="Nouveau mot de passe" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
            <Button className="w-full" onClick={submitReset} loading={patchUser.isPending} disabled={newPass.length < 4}>
              Réinitialiser
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ------------------------------------------------------------------
// Note pour le client — zone de texte directe, un clic pour publier.
// Visible en haut de son accueil.
// ------------------------------------------------------------------
function NoteCoachCard({ userId, settings }: { userId: string; settings: UserSettings }) {
  const save = useAdminSaveSettings(userId);
  const [note, setNote] = useState(settings.noteCoach ?? '');

  useEffect(() => {
    setNote(settings.noteCoach ?? '');
  }, [settings.noteCoach]);

  const dirty = note !== (settings.noteCoach ?? '');

  const submit = async () => {
    try {
      await save.mutateAsync({ ...settings, noteCoach: note.trim() || null });
      toast.success(note.trim() ? 'Note publiée sur l’accueil du client' : 'Note retirée');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Enregistrement impossible');
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquareText className="size-4 text-violet" /> Note pour le client
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-2.5 text-xs text-ink-2">
          Affichée en évidence sur son accueil — consignes de la semaine, ajustements, encouragements.
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Ex. Nouveau cycle : +2,5 kg sur le développé couché cette semaine. Dors mieux !"
          className="w-full resize-none rounded-xl border border-line/60 bg-bg-2/60 px-3 py-2.5 text-sm focus:border-violet/60 focus:outline-none"
        />
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <p className="text-[11px] text-ink-2">
            {settings.noteCoach ? 'Une note est visible par le client.' : 'Aucune note affichée.'}
          </p>
          <Button size="sm" onClick={submit} loading={save.isPending} disabled={!dirty}>
            <Send className="size-3.5" /> Publier
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------
// Champs de suivi personnalisés (ex. tour de taille, eau, humeur…)
// ------------------------------------------------------------------
function ChampsCard({ userId }: { userId: string }) {
  const { data: champs } = useAdminChamps(userId);
  const save = useAdminSaveChamp(userId);
  const del = useAdminDeleteChamp(userId);
  const [draft, setDraft] = useState<{ champId?: string; nom: string; unite: string } | null>(null);

  const submit = async () => {
    if (!draft?.nom.trim()) return;
    try {
      await save.mutateAsync(draft);
      toast.success(draft.champId ? 'Champ modifié' : 'Champ créé');
      setDraft(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Enregistrement impossible');
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-violet" /> Champs de suivi · {champs?.length ?? 0}
        </CardTitle>
        <Button size="sm" variant="secondary" onClick={() => setDraft({ nom: '', unite: '' })}>
          <Plus className="size-4" /> Champ
        </Button>
      </CardHeader>
      <CardContent>
        {!champs?.length && (
          <p className="text-sm text-ink-2">
            Invente des mesures à suivre — tour de taille, eau bue, humeur… le client les remplit dans son journal.
          </p>
        )}
        <div className="space-y-1.5">
          {(champs ?? []).map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl bg-bg-2/50 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{c.nom}</p>
                {c.unite && <p className="text-[11px] text-ink-2">en {c.unite}</p>}
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDraft({ champId: c.id, nom: c.nom, unite: c.unite })} aria-label="Modifier">
                <PenLine className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-ink-2 hover:text-danger"
                onClick={async () => {
                  try {
                    await del.mutateAsync(c.id);
                    toast.success('Champ supprimé');
                  } catch (e) {
                    toast.error(e instanceof ApiError ? e.message : 'Suppression impossible');
                  }
                }}
                aria-label="Supprimer"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogTitle>{draft?.champId ? 'Modifier le champ' : 'Nouveau champ de suivi'}</DialogTitle>
          <DialogDescription>Le client le remplira chaque jour dans son journal.</DialogDescription>
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-ink-2">Nom</label>
              <Input value={draft?.nom ?? ''} onChange={(e) => setDraft((d) => (d ? { ...d, nom: e.target.value } : d))} placeholder="Tour de taille, Eau bue, Humeur…" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-ink-2">Unité (optionnel)</label>
              <Input value={draft?.unite ?? ''} onChange={(e) => setDraft((d) => (d ? { ...d, unite: e.target.value } : d))} placeholder="cm, L, /10…" />
            </div>
            <Button className="w-full" onClick={submit} loading={save.isPending} disabled={!draft?.nom.trim()}>
              Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ------------------------------------------------------------------
// Ligne de séance extensible (détail exos × séries + suppression)
// ------------------------------------------------------------------
function SeanceRow({
  seance: s,
  open,
  onToggle,
  onDelete,
}: {
  seance: Session;
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const doneSets = s.exercices.reduce((n, e) => n + e.sets.filter((x) => x.terminee).length, 0);
  return (
    <div className="rounded-xl bg-bg-2/50">
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm">
        <span className="w-24 shrink-0 text-xs font-bold text-ink-2">{formatDateFr(s.date)}</span>
        <span className="min-w-0 flex-1 truncate font-semibold">{s.programmeNom}</span>
        <span className="text-xs text-ink-2">{doneSets} séries</span>
        <Badge tone={s.statut === 'terminee' ? 'success' : 'warn'}>{s.statut === 'terminee' ? 'terminée' : 'abandonnée'}</Badge>
        <ChevronDown className={cn('size-4 text-ink-2 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-line/40 px-3 py-3">
          {s.exercices.map((e) => (
            <div key={`${e.ordre}-${e.exercice}`} className="text-xs">
              <p className="font-bold">{e.exercice}</p>
              <p className="mt-0.5 flex flex-wrap gap-x-2 text-ink-2">
                {e.sets.map((set) => (
                  <span key={set.serie} className={cn(!set.terminee && 'opacity-50 line-through')}>
                    {set.chargeKg ?? '—'}kg × {set.repetitions ?? '—'}
                  </span>
                ))}
              </p>
            </div>
          ))}
          {s.notes && <p className="text-xs italic text-ink-2">{s.notes}</p>}
          <div className="flex justify-end pt-1">
            <Button size="sm" variant="ghost" className="text-ink-2 hover:text-danger" onClick={onDelete}>
              <Trash2 className="size-3.5" /> Supprimer la séance
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Objectifs + profil + consignes du client
// ------------------------------------------------------------------
const SETTINGS_FIELDS: { key: keyof UserSettings; label: string; suffix?: string }[] = [
  { key: 'objectifPoids', label: 'Poids cible', suffix: 'kg' },
  { key: 'poidsDepart', label: 'Poids de départ', suffix: 'kg' },
  { key: 'objectifCalories', label: 'Calories / jour', suffix: 'kcal' },
  { key: 'objectifProteines', label: 'Protéines / jour', suffix: 'g' },
  { key: 'objectifGlucides', label: 'Glucides / jour', suffix: 'g' },
  { key: 'objectifLipides', label: 'Lipides / jour', suffix: 'g' },
  { key: 'objectifPas', label: 'Pas / jour' },
  { key: 'reposDefautSec', label: 'Repos défaut', suffix: 's' },
];

const JOURS_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function SettingsDialog({ userId, settings, onClose }: { userId: string; settings: UserSettings; onClose: () => void }) {
  const save = useAdminSaveSettings(userId);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [tz, setTz] = useState(settings.timezone);
  const [profil, setProfil] = useState({ nomAffiche: '', tailleCm: '', dateNaissance: '' });
  const [jours, setJours] = useState<number[]>(settings.joursSeance ?? []);

  useEffect(() => {
    const d: Record<string, string> = {};
    for (const f of SETTINGS_FIELDS) {
      const v = settings[f.key];
      d[f.key] = v == null ? '' : String(v);
    }
    setDraft(d);
    setProfil({
      nomAffiche: settings.nomAffiche ?? '',
      tailleCm: settings.tailleCm == null ? '' : String(settings.tailleCm),
      dateNaissance: settings.dateNaissance ?? '',
    });
    setJours(settings.joursSeance ?? []);
  }, [settings]);

  const toggleJour = (j: number) =>
    setJours((cur) => (cur.includes(j) ? cur.filter((x) => x !== j) : [...cur, j].sort()));

  const submit = async () => {
    const next: UserSettings = {
      ...settings,
      timezone: tz.trim() || settings.timezone,
      nomAffiche: profil.nomAffiche.trim() || null,
      tailleCm: profil.tailleCm.trim() === '' ? null : Number(profil.tailleCm.replace(',', '.')),
      dateNaissance: profil.dateNaissance || null,
      joursSeance: jours,
    };
    for (const f of SETTINGS_FIELDS) {
      const raw = draft[f.key]?.trim() ?? '';
      // @ts-expect-error affectation champ par champ
      next[f.key] = raw === '' ? null : Number(raw.replace(',', '.'));
    }
    next.reposDefautSec = next.reposDefautSec ?? 90;
    try {
      await save.mutateAsync(next);
      toast.success('Paramètres du client enregistrés');
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Enregistrement impossible');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto lg:max-w-2xl">
        <DialogTitle>Paramètres du client</DialogTitle>
        <DialogDescription>Objectifs, profil, planning et consignes — tout est éditable.</DialogDescription>
        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-2">Objectifs</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {SETTINGS_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-2">
                    {f.label}{f.suffix ? ` (${f.suffix})` : ''}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step="0.1"
                    value={draft[f.key] ?? ''}
                    onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-2">Profil</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-2">Nom affiché</label>
                <Input value={profil.nomAffiche} onChange={(e) => setProfil({ ...profil, nomAffiche: e.target.value })} placeholder="Raphaël" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-2">Taille (cm)</label>
                <Input type="number" min={50} max={300} value={profil.tailleCm} onChange={(e) => setProfil({ ...profil, tailleCm: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-2">Naissance</label>
                <Input type="date" value={profil.dateNaissance} onChange={(e) => setProfil({ ...profil, dateNaissance: e.target.value })} />
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-2">Jours d'entraînement</p>
            <div className="flex flex-wrap gap-1.5">
              {JOURS_LABELS.map((label, j) => (
                <button
                  key={j}
                  onClick={() => toggleJour(j)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
                    jours.includes(j)
                      ? 'border-accent/60 bg-accent/15 text-accent'
                      : 'border-line/60 bg-bg-2/50 text-ink-2 hover:border-line',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-2">Fuseau horaire</label>
            <Input value={tz} onChange={(e) => setTz(e.target.value)} placeholder="Europe/Paris" />
          </div>
        </div>
        <Button className="mt-4 w-full" onClick={submit} loading={save.isPending}>Enregistrer</Button>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------
// Journée du journal — champs + repas du client
// ------------------------------------------------------------------
function JournalDialog({ userId, entry, onClose }: { userId: string; entry: JournalEntry | null; onClose: () => void }) {
  const upsert = useAdminUpsertJournal(userId);
  const [date, setDate] = useState(entry?.date ?? new Date().toISOString().slice(0, 10));
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const f of JOURNAL_FIELDS_UI) {
      const v = entry?.[f.key];
      d[f.key] = v == null ? '' : String(v);
    }
    d.entrainement = entry?.entrainement ?? '';
    return d;
  });

  const { data: aliments } = useAdminAliments();
  const { data: repas } = useAdminJournalAliments(userId, date);
  const { data: custom } = useAdminChampValeurs(userId, date);
  const setChamp = useSetChampValeur(date, userId);
  const [customVals, setCustomVals] = useState<Record<string, string>>({});
  useEffect(() => {
    if (custom) {
      const d: Record<string, string> = {};
      for (const c of custom) d[c.champId] = c.valeur ?? '';
      setCustomVals(d);
    }
  }, [custom]);
  const addRepas = useAdminAddJournalAliment(userId);
  const delRepas = useAdminRemoveJournalAliment(userId);
  const [alimentId, setAlimentId] = useState('');
  const [qty, setQty] = useState('');

  const submit = async () => {
    const values: Partial<JournalValues> = {};
    for (const f of JOURNAL_FIELDS_UI) {
      const raw = fields[f.key]?.trim() ?? '';
      // @ts-expect-error affectation champ par champ
      values[f.key] = raw === '' ? null : Number(raw.replace(',', '.'));
    }
    values.entrainement = fields.entrainement?.trim() ? fields.entrainement.trim() : null;
    try {
      await upsert.mutateAsync({ date, values });
      // Champs personnalisés : n'écrire que les valeurs modifiées.
      for (const c of custom ?? []) {
        const v = customVals[c.champId]?.trim() ?? '';
        const next = v === '' ? null : v;
        if (next !== (c.valeur ?? null)) {
          await setChamp.mutateAsync({ champId: c.champId, valeur: next });
        }
      }
      toast.success(`Journée du ${formatDateFr(date)} enregistrée`);
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Enregistrement impossible');
    }
  };

  const addFood = async () => {
    try {
      await addRepas.mutateAsync({ date, alimentId, quantiteG: Number(qty) });
      setAlimentId('');
      setQty('');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Ajout impossible');
    }
  };

  const repasTotal = useMemo(
    () => (repas ?? []).reduce((n, l) => n + l.kcal, 0),
    [repas],
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto lg:max-w-2xl">
        <DialogTitle>{entry ? 'Modifier la journée' : 'Nouvelle journée'}</DialogTitle>
        <DialogDescription>
          {entry ? `Données du ${formatDateFr(entry.date)}` : 'Crée ou complète une journée du journal'}
        </DialogDescription>
        <div className="mt-4 space-y-3">
          {!entry && (
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-2">Date</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {JOURNAL_FIELDS_UI.map((f) => (
              <div key={f.key}>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-2">
                  {f.label}{f.suffix ? ` (${f.suffix})` : ''}
                </label>
                <Input
                  type="number"
                  min={0}
                  step="0.1"
                  value={fields[f.key] ?? ''}
                  onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-2">Entraînement</label>
            <Input value={fields.entrainement ?? ''} onChange={(e) => setFields({ ...fields, entrainement: e.target.value })} placeholder="Full body, repos…" />
          </div>

          {/* Champs personnalisés définis par le coach */}
          {(custom?.length ?? 0) > 0 && (
            <div className="rounded-2xl border border-violet/30 bg-violet/5 p-3">
              <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-2">
                <SlidersHorizontal className="size-3.5 text-violet" /> Mesures du coach
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {custom!.map((c) => (
                  <div key={c.champId}>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-2">
                      {c.nom}{c.unite ? ` (${c.unite})` : ''}
                    </label>
                    <Input
                      value={customVals[c.champId] ?? ''}
                      onChange={(e) => setCustomVals({ ...customVals, [c.champId]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Repas prescrits / consommés */}
          <div className="rounded-2xl border border-line/50 p-3">
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-2">
              <Utensils className="size-3.5 text-success" /> Aliments du jour · {repasTotal} kcal
            </p>
            <div className="space-y-1">
              {(repas ?? []).map((l) => (
                <div key={l.id} className="flex items-center gap-2 rounded-lg bg-bg-2/60 px-2.5 py-1.5 text-xs">
                  <span className="min-w-0 flex-1 truncate font-semibold">{l.nom}</span>
                  <span className="text-ink-2">{l.quantiteG} g</span>
                  <span className="font-bold">{l.kcal} kcal</span>
                  <button onClick={() => delRepas.mutate({ date, ligneId: l.id })} className="text-ink-2 hover:text-danger" aria-label="Retirer">
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
            {(aliments?.length ?? 0) > 0 && (
              <div className="mt-2 flex gap-2">
                <Select value={alimentId} onValueChange={setAlimentId}>
                  <SelectTrigger className="h-9 flex-1 text-xs">
                    <SelectValue placeholder="Aliment…" />
                  </SelectTrigger>
                  <SelectContent>
                    {aliments!.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={1}
                  className="h-9 w-24"
                  placeholder="g"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
                <Button size="sm" variant="secondary" onClick={addFood} loading={addRepas.isPending} disabled={!alimentId || !(Number(qty) > 0)}>
                  <Plus className="size-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Échanges client ↔ coach sur cette journée */}
          <CommentairesFil userId={userId} date={date} />

          <Button className="w-full" onClick={submit} loading={upsert.isPending} disabled={!date}>
            Enregistrer la journée
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------
// Fil de commentaires d'une journée — le coach lit et répond ici.
// ------------------------------------------------------------------
function CommentairesFil({ userId, date }: { userId: string; date: string }) {
  const { data: fil } = useAdminCommentaires(userId, date);
  const add = useAdminAddCommentaire(userId);
  const del = useAdminDeleteCommentaire(userId);
  const [texte, setTexte] = useState('');

  const envoyer = async () => {
    if (!texte.trim()) return;
    try {
      await add.mutateAsync({ date, texte: texte.trim() });
      setTexte('');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Envoi impossible');
    }
  };

  return (
    <div className="rounded-2xl border border-violet/30 bg-violet/5 p-3">
      <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-2">
        <MessageSquareText className="size-3.5 text-violet" /> Échanges du jour · {fil?.length ?? 0}
      </p>
      <div className="space-y-1.5">
        {(fil ?? []).map((c) => (
          <div
            key={c.id}
            className={cn(
              'group flex items-start gap-2 rounded-xl px-2.5 py-1.5 text-xs',
              c.auteur === 'coach' ? 'bg-violet/15' : 'bg-bg-2/70',
            )}
          >
            <span className={cn('mt-0.5 shrink-0 text-[9px] font-bold uppercase', c.auteur === 'coach' ? 'text-violet' : 'text-accent')}>
              {c.auteur === 'coach' ? 'Coach' : 'Client'}
            </span>
            <span className="min-w-0 flex-1">{c.texte}</span>
            <button
              onClick={() => del.mutate({ date, cid: c.id })}
              className="shrink-0 text-ink-2 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
              aria-label="Supprimer le message"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        ))}
        {!fil?.length && <p className="text-xs text-ink-2">Aucun message — le client peut laisser un ressenti sur sa journée.</p>}
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          className="h-9 flex-1 text-xs"
          placeholder="Répondre au client…"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && envoyer()}
        />
        <Button size="sm" variant="secondary" onClick={envoyer} loading={add.isPending} disabled={!texte.trim()}>
          <Send className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-xl bg-bg-2/60 py-2.5">
      <p className="text-sm font-extrabold">
        {value}
        {suffix && <span className="ml-0.5 text-[10px] font-semibold text-ink-2">{suffix}</span>}
      </p>
      <p className={cn('text-[10px] font-bold uppercase tracking-wider text-ink-2')}>{label}</p>
    </div>
  );
}

// ------------------------------------------------------------------
// Tendances du client — courbes poids / calories / pas (45 j), les
// mêmes données qu'il voit dans son onglet Progrès.
// ------------------------------------------------------------------
const AXIS = { stroke: 'var(--ink-2)', fontSize: 10, tickLine: false, axisLine: false } as const;
const GRID = { stroke: 'var(--line)', strokeDasharray: '3 3', vertical: false } as const;
const TOOLTIP_STYLE = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--line)',
  borderRadius: '12px',
  fontSize: 12,
  color: 'var(--ink)',
} as const;

function TendancesCard({
  entries,
  today,
  settings,
}: {
  entries: JournalEntry[];
  today: string;
  settings: UserSettings | null;
}) {
  const jours = 45;
  const poids = seriesByDay(entries, 'poids', jours, today);
  const ma7 = movingAverage(poids, 7);
  const poidsChart = poids.map((p, i) => ({ ...p, ma7: ma7[i]!.value }));
  const calories = seriesByDay(entries, 'calories', jours, today);
  const pas = seriesByDay(entries, 'pas', jours, today);

  const has = [poids, calories, pas].some((s) => s.some((p) => p.value !== null));
  if (!has) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Footprints className="size-4 text-success" /> Tendances — 45 j
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-5 xl:grid-cols-3">
          {/* Poids + moyenne mobile */}
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-2">
              Poids (kg) + moy. 7 j
            </p>
            {poids.some((p) => p.value !== null) ? (
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={poidsChart} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="date" tickFormatter={formatShort} {...AXIS} interval="preserveStartEnd" minTickGap={60} />
                  <YAxis domain={['dataMin - 1', 'dataMax + 1']} {...AXIS} tickFormatter={(v: number) => v.toFixed(0)} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, n: string) => [`${v?.toFixed?.(1)} kg`, n === 'ma7' ? 'Moy. 7 j' : 'Poids']} labelFormatter={(d) => formatShort(String(d))} />
                  <Area type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} fill="var(--accent)" fillOpacity={0.08} connectNulls={false} dot={false} name="Poids" />
                  <Line type="monotone" dataKey="ma7" stroke="var(--violet)" strokeWidth={2} dot={false} connectNulls name="Moy. 7 j" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-xs text-ink-2">Pas de pesées.</p>
            )}
          </div>
          {/* Calories vs objectif */}
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-2">
              Calories{settings?.objectifCalories != null ? ` — obj. ${settings.objectifCalories}` : ''} (kcal)
            </p>
            {calories.some((p) => p.value !== null) ? (
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={calories} margin={{ top: 4, right: 4, bottom: 0, left: -14 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="date" tickFormatter={formatShort} {...AXIS} interval="preserveStartEnd" minTickGap={60} />
                  <YAxis {...AXIS} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v} kcal`, 'Calories']} labelFormatter={(d) => formatShort(String(d))} />
                  {settings?.objectifCalories != null && (
                    <Line type="monotone" dataKey={() => settings.objectifCalories} stroke="var(--accent)" strokeDasharray="5 4" dot={false} strokeWidth={1.5} />
                  )}
                  <Bar dataKey="value" fill="var(--warn)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-xs text-ink-2">Pas de données.</p>
            )}
          </div>
          {/* Pas */}
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-2">
              Pas quotidiens{settings?.objectifPas != null ? ` — obj. ${settings.objectifPas}` : ''}
            </p>
            {pas.some((p) => p.value !== null) ? (
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={pas} margin={{ top: 4, right: 4, bottom: 0, left: -14 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="date" tickFormatter={formatShort} {...AXIS} interval="preserveStartEnd" minTickGap={60} />
                  <YAxis {...AXIS} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v} pas`, 'Pas']} labelFormatter={(d) => formatShort(String(d))} />
                  <Line type="monotone" dataKey="value" stroke="var(--violet)" strokeWidth={2} connectNulls={false} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-xs text-ink-2">Pas de données.</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------
// Copie d'un programme vers un autre client.
// ------------------------------------------------------------------
function CopierDialog({
  deUserId,
  prog,
  users,
  onClose,
}: {
  deUserId: string;
  prog: { id: string; nom: string };
  users: AdminUser[];
  onClose: () => void;
}) {
  const copier = useAdminCopierProgramme();
  const [cible, setCible] = useState('');
  const cibles = users.filter((u) => u.id !== deUserId && u.role === 'user');

  const submit = async () => {
    try {
      await copier.mutateAsync({ deUserId, progId: prog.id, versUserId: cible });
      toast.success(`« ${prog.nom} » copié vers ${cibles.find((u) => u.id === cible)?.email}`);
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Copie impossible');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>Copier « {prog.nom} »</DialogTitle>
        <DialogDescription>Le programme complet (exercices, séries, repos) est recréé chez le client choisi.</DialogDescription>
        <div className="mt-4 space-y-3">
          <Select value={cible} onValueChange={setCible}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir le client…" />
            </SelectTrigger>
            <SelectContent>
              {cibles.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.email}{u.disabled ? ' (désactivé)' : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button className="w-full" onClick={submit} loading={copier.isPending} disabled={!cible}>
            <Copy className="size-4" /> Copier le programme
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
