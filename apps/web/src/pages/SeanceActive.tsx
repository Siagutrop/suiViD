import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  Clock,
  Dumbbell,
  Flag,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Timer,
  Youtube,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ProgramExercise, SessionExercise } from '@suivi/shared';
import { useExercices, useFinishSession, useLastPerf, useParametres, useProgramme, useProgrammes, useUpdateToday, useToday } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { loadDraft, saveDraft, type SessionDraft } from '@/lib/draft';
import { formatClock, formatKg, youtubeEmbed, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/misc';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';

// ------------------------------------------------------------------
// Séance active — un exercice à la fois, saisie charge × répétitions
// par série, chrono de séance, minuteur de récupération, brouillon
// local récupérable (marqué « non synchronisé »).
// ------------------------------------------------------------------

export function SeanceActivePage() {
  const [params] = useSearchParams();
  const programmeId = params.get('programme');
  const { data: programmes, isLoading } = useProgrammes();
  const [draft, setDraft] = useState<SessionDraft | null>(() => loadDraft());
  const navigate = useNavigate();

  const actif = programmes?.find((p) => p.statut === 'actif');
  const targetId = programmeId ?? actif?.id;

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="size-10 animate-pulse rounded-full bg-line" />
      </div>
    );
  }

  if (draft) {
    return (
      <SessionRunner
        key={draft.debut}
        draft={draft}
        onUpdate={setDraft}
        onExit={() => { saveDraft(null); setDraft(null); navigate('/seances'); }}
      />
    );
  }

  const prog = programmes?.find((p) => p.id === targetId);
  return <StartScreen programme={prog} onStart={(d) => { saveDraft(d); setDraft(d); }} />;
}

// ---------- Écran de démarrage ----------

function StartScreen({ programme, onStart }: { programme?: import('@suivi/shared').Program; onStart: (d: SessionDraft) => void }) {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="flex items-center gap-3 p-4">
        <Button asChild variant="ghost" size="icon">
          <Link to="/seances"><ArrowLeft className="size-5" /></Link>
        </Button>
        <h1 className="text-lg font-extrabold">Démarrer une séance</h1>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        {programme ? (
          <>
            <div className="flex size-24 items-center justify-center rounded-3xl bg-accent-soft">
              <Dumbbell className="size-12 text-accent" />
            </div>
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight">{programme.nom}</h2>
              <p className="mt-2 text-ink-2">
                {programme.exercices.length} exercices ·{' '}
                {programme.exercices.reduce((a, e) => a + e.series, 0)} séries
              </p>
            </div>
            <Button
              size="xl"
              className="w-full max-w-xs"
              onClick={() =>
                onStart({
                  programmeId: programme.id,
                  programmeNom: programme.nom,
                  debut: new Date().toISOString(),
                  exercices: programme.exercices.map((e, i) => programToSession(e, i)),
                  notes: null,
                  index: 0,
                })
              }
            >
              <Play className="size-6" fill="currentColor" />
              Commencer la séance
            </Button>
          </>
        ) : (
          <div className="text-ink-2">
            <p className="text-lg font-bold text-ink">Aucun programme disponible</p>
            <p className="mt-1 text-sm">Créez un programme dans l'onglet Séances.</p>
            <Button className="mt-6" variant="secondary" onClick={() => navigate('/seances')}>
              Retour
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function programToSession(e: ProgramExercise, i: number): SessionExercise {
  return {
    exercice: e.exercice,
    ordre: i + 1,
    passee: false,
    sets: Array.from({ length: e.series }, (_, s) => ({
      serie: s + 1,
      chargeKg: null,
      repetitions: null,
      terminee: false,
      notes: null,
    })),
  };
}

// ---------- Moteur de séance ----------

function SessionRunner({
  draft,
  onUpdate,
  onExit,
}: {
  draft: SessionDraft;
  onUpdate: (d: SessionDraft) => void;
  onExit: () => void;
}) {
  const { data: exercices } = useExercices();
  const { data: lastPerf } = useLastPerf();
  const { data: settings } = useParametres();
  const { data: today } = useToday();
  const finish = useFinishSession();
  const updateToday = useUpdateToday();
  const navigate = useNavigate();

  const [elapsed, setElapsed] = useState(() => Math.max(0, (Date.now() - new Date(draft.debut).getTime()) / 1000));
  const [rest, setRest] = useState<number | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);

  // Chrono
  useEffect(() => {
    const t = setInterval(() => setElapsed((Date.now() - new Date(draft.debut).getTime()) / 1000), 1000);
    return () => clearInterval(t);
  }, [draft.debut]);

  // Minuteur de repos
  useEffect(() => {
    if (rest === null || rest <= 0) return;
    const t = setInterval(() => setRest((r) => (r !== null && r > 0 ? r - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [rest]);

  const update = (fn: (d: SessionDraft) => SessionDraft) => {
    const next = fn(draft);
    saveDraft(next);
    onUpdate(next);
  };

  const idx = Math.min(draft.index, draft.exercices.length - 1);
  const ex = draft.exercices[idx]!;
  const exInfo = exercices?.find((e) => e.nom === ex.exercice);
  const progExo = useProgramme(draft.programmeId ?? '');
  const progInfo = progExo.data?.exercices.find((e) => e.exercice === ex.exercice);
  const perf = lastPerf?.[ex.exercice];
  const embed = youtubeEmbed(exInfo?.videoUrl);

  const doneSets = ex.sets.filter((s) => s.terminee).length;
  const totalDone = draft.exercices.reduce((a, e) => a + e.sets.filter((s) => s.terminee).length, 0);
  const totalSets = draft.exercices.reduce((a, e) => a + e.sets.length, 0);

  const setSet = (setIdx: number, patch: Partial<SessionExercise['sets'][number]>) =>
    update((d) => ({
      ...d,
      exercices: d.exercices.map((e, i) =>
        i === idx ? { ...e, sets: e.sets.map((s, j) => (j === setIdx ? { ...s, ...patch } : s)) } : e,
      ),
    }));

  const validateSet = (setIdx: number) => {
    setSet(setIdx, { terminee: true });
    // Lance le minuteur de récupération après validation
    setRest(progInfo?.reposSec ?? settings?.reposDefautSec ?? 90);
  };

  const addSet = () =>
    update((d) => ({
      ...d,
      exercices: d.exercices.map((e, i) =>
        i === idx
          ? { ...e, sets: [...e.sets, { serie: e.sets.length + 1, chargeKg: null, repetitions: null, terminee: false, notes: null }] }
          : e,
      ),
    }));

  const goTo = (i: number) => update((d) => ({ ...d, index: Math.max(0, Math.min(i, d.exercices.length - 1)) }));
  const skip = () => {
    update((d) => ({
      ...d,
      exercices: d.exercices.map((e, i) => (i === idx ? { ...e, passee: true } : e)),
      index: Math.min(idx + 1, d.exercices.length - 1),
    }));
    if (idx === draft.exercices.length - 1) setFinishOpen(true);
  };

  const doFinish = async (statut: 'terminee' | 'abandonnee', markJournal: boolean) => {
    const fin = new Date().toISOString();
    try {
      await finish.mutateAsync({
        programmeId: draft.programmeId,
        programmeNom: draft.programmeNom,
        debut: draft.debut,
        fin,
        statut,
        notes: draft.notes,
        exercices: draft.exercices,
      });
      // Renseigne « Entraînement » du journal si la séance est du jour même.
      if (markJournal && today && !today.rowMissing) {
        try {
          await updateToday.mutateAsync({
            values: { entrainement: draft.programmeNom },
            base: { entrainement: today.entry.entrainement },
          });
        } catch {
          toast.error('Séance enregistrée, journal non mis à jour (conflit)');
        }
      }
      saveDraft(null);
      setFinishOpen(false);
      navigate('/seances', { state: { finished: true } });
      toast.success('Séance enregistrée');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Enregistrement impossible — réessayez');
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      {/* Barre supérieure : chrono + progression */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-accent" />
            <span className="num-display text-lg">{formatClock(elapsed)}</span>
          </div>
          <div className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-widest text-ink-2">Séance — non synchronisée</p>
            <p className="text-xs font-bold text-warn">{draft.programmeNom}</p>
          </div>
          <Badge tone="accent">
            {totalDone}/{totalSets}
          </Badge>
        </div>
        {/* Progression exercices */}
        <div className="flex gap-1 px-4 pb-2.5">
          {draft.exercices.map((e, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={cn(
                'h-1.5 min-w-3 flex-1 rounded-full transition-colors',
                i === idx
                  ? 'bg-accent'
                  : e.passee
                    ? 'bg-warn/50'
                    : e.sets.every((s) => s.terminee)
                      ? 'bg-success'
                      : 'bg-line',
              )}
              aria-label={`Exercice ${i + 1}`}
            />
          ))}
        </div>
      </header>

      {/* Exercice courant */}
      <main className="flex-1 overflow-y-auto px-4 py-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.18 }}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-ink-2">
                  Exercice {idx + 1}/{draft.exercices.length}
                </p>
                <h2 className="mt-0.5 text-xl font-extrabold leading-tight">{ex.exercice}</h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {exInfo && <Badge tone="violet">{exInfo.muscle}</Badge>}
                  {progInfo?.repsCible && <Badge>Cible {progInfo.repsCible}</Badge>}
                  {(progInfo?.reposSec ?? settings?.reposDefautSec) != null && (
                    <Badge>Repos {progInfo?.reposSec ?? settings?.reposDefautSec}s</Badge>
                  )}
                  {ex.passee && <Badge tone="warn">Passé</Badge>}
                </div>
              </div>
              {embed && (
                <Dialog open={videoOpen} onOpenChange={setVideoOpen}>
                  <Button variant="secondary" size="icon" onClick={() => setVideoOpen(true)} aria-label="Vidéo">
                    <Youtube className="size-5" />
                  </Button>
                  <DialogContent className="p-3">
                    <DialogTitle className="px-2 pt-2">{ex.exercice}</DialogTitle>
                    <div className="mt-3 aspect-[9/16] overflow-hidden rounded-xl bg-black sm:aspect-video">
                      <iframe
                        src={`${embed}?rel=0`}
                        className="size-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title={ex.exercice}
                      />
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            {progInfo?.variante && (
              <div className="mb-4 rounded-xl border border-violet/30 bg-violet-soft p-3 text-sm text-ink">
                <span className="font-bold text-violet">Variante : </span>
                {progInfo.variante}
              </div>
            )}

            {/* Dernière performance */}
            {perf && (
              <div className="mb-4 flex items-center gap-2 text-xs text-ink-2">
                <RotateCcw className="size-3.5" />
                Dernière fois :{' '}
                {perf.map((p) => `${formatKg(p.chargeKg)} × ${p.repetitions ?? '—'}`).join(' · ')}
              </div>
            )}

            {/* Séries */}
            <div className="space-y-2.5">
              {ex.sets.map((s, si) => (
                <SetRow
                  key={si}
                  set={s}
                  index={si}
                  onPatch={(p) => setSet(si, p)}
                  onValidate={() => validateSet(si)}
                />
              ))}
              <Button variant="secondary" className="w-full" onClick={addSet}>
                <Plus className="size-4" /> Ajouter une série
              </Button>
            </div>

            {/* Notes exercice */}
            <textarea
              value={ex.sets[0]?.notes ?? ''}
              onChange={(ev) =>
                update((d) => ({
                  ...d,
                  exercices: d.exercices.map((e, i) =>
                    i === idx ? { ...e, sets: e.sets.map((s, j) => (j === 0 ? { ...s, notes: ev.target.value || null } : s)) } : e,
                  ),
                }))
              }
              placeholder="Notes (sensation, réglage…)"
              rows={2}
              className="mt-4 w-full resize-none rounded-xl border border-line bg-bg-2 p-3 text-sm text-ink placeholder:text-ink-2/50 focus:border-accent/50 focus:outline-none"
            />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Minuteur de récupération */}
      <AnimatePresence>
        {rest !== null && rest > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed inset-x-4 bottom-24 z-40 flex items-center justify-between rounded-2xl border border-violet/40 bg-violet px-5 py-3 text-white shadow-lift"
          >
            <div className="flex items-center gap-2">
              <Timer className="size-5" />
              <span className="text-sm font-bold">Récupération</span>
            </div>
            <span className="num-display text-2xl">{formatClock(rest)}</span>
            <button className="text-xs font-bold underline underline-offset-2" onClick={() => setRest(null)}>
              Passer
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Barre d'action basse */}
      <footer className="sticky bottom-0 z-30 border-t border-line bg-bg/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <Button variant="secondary" size="icon" onClick={() => goTo(idx - 1)} disabled={idx === 0} aria-label="Précédent">
            <ChevronLeft className="size-5" />
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="flex-1 text-ink-2" onClick={skip}>
              <SkipForward className="size-4" /> Passer
            </Button>
            {idx < draft.exercices.length - 1 ? (
              <Button className="flex-1" onClick={() => goTo(idx + 1)}>
                Suivant <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button className="flex-1" onClick={() => setFinishOpen(true)}>
                <Flag className="size-4" /> Terminer
              </Button>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-ink-2 hover:text-danger"
            aria-label="Abandonner"
            onClick={() => setFinishOpen(true)}
          >
            <AlertTriangle className="size-5" />
          </Button>
        </div>
      </footer>

      {/* Résumé de fin */}
      <FinishDialog
        open={finishOpen}
        onOpenChange={setFinishOpen}
        draft={draft}
        elapsed={elapsed}
        loading={finish.isPending}
        onFinish={doFinish}
        onAbandonDraft={onExit}
      />
    </div>
  );
}

// ---------- Ligne de série ----------

function SetRow({
  set,
  index,
  onPatch,
  onValidate,
}: {
  set: SessionExercise['sets'][number];
  index: number;
  onPatch: (p: Partial<SessionExercise['sets'][number]>) => void;
  onValidate: () => void;
}) {
  const [pulse, setPulse] = useState(false);
  const numInput =
    'h-12 w-full rounded-xl border border-line bg-bg-2 text-center text-lg font-extrabold tabular-nums focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60';
  return (
    <motion.div
      layout
      className={cn(
        'card flex items-center gap-2.5 p-3 transition-colors',
        set.terminee && 'border-success/40 bg-success/5',
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold',
          set.terminee ? 'bg-success text-on-accent' : 'bg-line/60 text-ink-2',
        )}
      >
        {index + 1}
      </span>
      <div className="flex-1">
        <label className="mb-0.5 block text-center text-[10px] font-bold uppercase tracking-wider text-ink-2">
          Charge (kg)
        </label>
        <input
          type="number"
          inputMode="decimal"
          step="0.5"
          min="0"
          value={set.chargeKg ?? ''}
          disabled={set.terminee}
          onChange={(e) => onPatch({ chargeKg: e.target.value === '' ? null : Number(e.target.value.replace(',', '.')) })}
          placeholder="0"
          className={numInput}
        />
      </div>
      <div className="flex-1">
        <label className="mb-0.5 block text-center text-[10px] font-bold uppercase tracking-wider text-ink-2">
          Répétitions
        </label>
        <input
          type="number"
          inputMode="numeric"
          step="1"
          min="0"
          value={set.repetitions ?? ''}
          disabled={set.terminee}
          onChange={(e) => onPatch({ repetitions: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))) })}
          placeholder="0"
          className={numInput}
        />
      </div>
      <motion.button
        onClick={() => {
          if (set.terminee) return;
          setPulse(true);
          onValidate();
          setTimeout(() => setPulse(false), 500);
        }}
        animate={pulse ? { scale: [1, 1.15, 1] } : {}}
        transition={{ duration: 0.4 }}
        disabled={set.terminee}
        className={cn(
          'flex size-12 shrink-0 items-center justify-center rounded-2xl font-bold transition-all active:scale-90',
          set.terminee ? 'bg-success text-on-accent' : 'bg-accent text-on-accent hover:brightness-110',
        )}
        aria-label={set.terminee ? 'Série validée' : 'Valider la série'}
      >
        <Check className="size-6" strokeWidth={3} />
      </motion.button>
    </motion.div>
  );
}

// ---------- Dialogue de fin ----------

function FinishDialog({
  open,
  onOpenChange,
  draft,
  elapsed,
  loading,
  onFinish,
  onAbandonDraft,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  draft: SessionDraft;
  elapsed: number;
  loading: boolean;
  onFinish: (statut: 'terminee' | 'abandonnee', markJournal: boolean) => void;
  onAbandonDraft: () => void;
}) {
  const done = draft.exercices.filter((e) => e.sets.some((s) => s.terminee));
  const skipped = draft.exercices.filter((e) => e.passee);
  const totalSets = done.reduce((a, e) => a + e.sets.filter((s) => s.terminee).length, 0);
  const volume = done.reduce(
    (a, e) => a + e.sets.reduce((x, s) => x + (s.terminee && s.chargeKg && s.repetitions ? s.chargeKg * s.repetitions : 0), 0),
    0,
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Fin de séance</DialogTitle>
        <DialogDescription>Résumé — la séance sera enregistrée dans Google Sheets.</DialogDescription>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-bg-2 p-3">
            <p className="num-display text-xl">{formatClock(elapsed)}</p>
            <p className="mt-0.5 text-[10px] font-bold uppercase text-ink-2">Durée</p>
          </div>
          <div className="rounded-xl bg-bg-2 p-3">
            <p className="num-display text-xl">{totalSets}</p>
            <p className="mt-0.5 text-[10px] font-bold uppercase text-ink-2">Séries</p>
          </div>
          <div className="rounded-xl bg-bg-2 p-3">
            <p className="num-display text-xl">{Math.round(volume)}</p>
            <p className="mt-0.5 text-[10px] font-bold uppercase text-ink-2">Volume (kg)</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-2">
          {done.length} exercice(s) réalisé(s){skipped.length ? ` · ${skipped.length} passé(s)` : ''} ·{' '}
          « Entraînement » sera renseigné dans le journal du jour.
        </p>
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" className="text-ink-2" onClick={onAbandonDraft} disabled={loading}>
            Abandonner sans enregistrer
          </Button>
          <Button variant="secondary" loading={loading} onClick={() => onFinish('abandonnee', false)}>
            Terminer sans journal
          </Button>
          <Button loading={loading} onClick={() => onFinish('terminee', true)}>
            <Check className="size-5" /> Enregistrer la séance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
