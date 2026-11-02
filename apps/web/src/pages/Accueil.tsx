import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useEffect, useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import {
  BedDouble,
  Beef,
  CalendarCheck,
  ChevronRight,
  Dumbbell,
  Flame,
  Footprints,
  Lock,
  Medal,
  NotebookPen,
  Play,
  Settings,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react';
import { seriesByDay, todayInTimezone } from '@suivi/shared';
import { useJournalRange, useParametres, useProgrammes, useSeances, useToday } from '@/hooks/queries';
import { formatDateFr, formatKg, formatNum, formatShort, greeting } from '@/lib/utils';
import { phraseDuJour } from '@/lib/phrases';
import { computeBadges, getSeenBadges, markBadgesSeen, streakJours, type Badge } from '@/lib/rewards';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MacroBar, ProgressRing } from '@/components/ui/ring';
import { Skeleton, EmptyState } from '@/components/ui/misc';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { loadDraft } from '@/lib/draft';
import { cn } from '@/lib/utils';

const appear = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

const BADGE_ICONS: Record<string, React.ReactNode> = {
  flame: <Flame className="size-4" />,
  'calendar-check': <CalendarCheck className="size-4" />,
  trophy: <Trophy className="size-4" />,
  dumbbell: <Dumbbell className="size-4" />,
  medal: <Medal className="size-4" />,
  beef: <Beef className="size-4" />,
  footprints: <Footprints className="size-4" />,
  'bed-double': <BedDouble className="size-4" />,
  'trending-down': <TrendingDown className="size-4" />,
  target: <Target className="size-4" />,
};

export function AccueilPage() {
  const { data: today, isLoading } = useToday();
  const { data: settings } = useParametres();
  const { data: journal } = useJournalRange(60);
  const { data: programmes } = useProgrammes();
  const { data: seances } = useSeances();
  const todayKey = todayInTimezone();
  const draft = loadDraft();

  const entry = today?.entry;
  const goal = settings?.objectifCalories ?? null;
  const eaten = entry?.calories ?? 0;
  const remaining = goal != null && entry?.calories != null ? goal - entry.calories : null;

  // Phrase du jour + récompenses (calculés depuis les données, aucun stockage)
  const jourAnnee = useMemo(
    () => Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 864e5),
    [],
  );
  const streak = useMemo(() => streakJours(journal ?? [], todayKey), [journal, todayKey]);
  const phrase = phraseDuJour(entry, goal, streak, jourAnnee);
  const badges = useMemo(
    () => computeBadges(journal ?? [], seances ?? [], settings, todayKey),
    [journal, seances, settings, todayKey],
  );
  const nouveaux = useMemo(() => {
    const seen = getSeenBadges();
    return badges.filter((b) => b.debloque && !seen.has(b.id)).map((b) => b.id);
  }, [badges]);
  useEffect(() => {
    if (nouveaux.length) markBadgesSeen(nouveaux);
  }, [nouveaux]);

  const actif = programmes?.find((p) => p.statut === 'actif');
  const lastSeance = seances?.[0];

  const weightSeries = journal ? seriesByDay(journal, 'poids', 7, todayKey) : [];
  const calSeries = journal ? seriesByDay(journal, 'calories', 7, todayKey) : [];
  const lastWeight = [...weightSeries].reverse().find((p) => p.value !== null)?.value ?? null;
  const prevWeight = [...weightSeries].reverse().find((p) => p.value !== null && p.date < (lastWeight ? weightSeries.find((x) => x.value === lastWeight)?.date ?? '' : ''))?.value ?? null;
  const weightDelta = lastWeight != null && prevWeight != null ? lastWeight - prevWeight : null;

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{greeting()} Raphaël</h1>
          <p className="mt-0.5 text-sm capitalize text-ink-2">{formatDateFr(todayKey)}</p>
        </div>
        <Button asChild variant="ghost" size="icon" aria-label="Paramètres">
          <Link to="/parametres">
            <Settings className="size-5" />
          </Link>
        </Button>
      </div>

      {/* Phrase du jour — contextuelle (calories, forme, série) */}
      <motion.div
        key={phrase}
        initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="flex items-start gap-2.5 rounded-2xl border border-line/60 bg-bg-2/50 px-4 py-3"
      >
        <Sparkles className="mt-0.5 size-4 shrink-0 text-warn" />
        <p className="text-[13px] leading-snug text-ink-2">
          <span className="font-semibold text-ink">{phrase}</span>
        </p>
      </motion.div>

      {/* Reprise de brouillon de séance */}
      {draft && (
        <motion.div {...appear}>
          <Link
            to="/seance-active"
            className="card flex items-center justify-between gap-3 border-warn/40 bg-warn/10 p-4"
          >
            <div className="flex items-center gap-3">
              <Dumbbell className="size-5 text-warn" />
              <div>
                <p className="text-sm font-bold">Séance en cours — non synchronisée</p>
                <p className="text-xs text-ink-2">{draft.programmeNom}</p>
              </div>
            </div>
            <ChevronRight className="size-5 text-ink-2" />
          </Link>
        </motion.div>
      )}

      {/* Carte calories principale */}
      <motion.div {...appear} transition={{ delay: 0.03 }}>
        <Card className="relative overflow-hidden">
          <div className="halo pointer-events-none absolute -right-10 -top-10 size-48 rounded-full bg-accent/20 blur-3xl" />
          <div className="halo halo-slow halo-delay pointer-events-none absolute -bottom-12 -left-8 size-40 rounded-full bg-violet/15 blur-3xl" />
          <div className="halo pointer-events-none absolute left-4 top-1/2 size-28 -translate-y-1/2 rounded-full bg-accent/15 blur-2xl" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="size-4 text-accent" /> Calories du jour
            </CardTitle>
            <Button asChild variant="ghost" size="sm" className="-mr-2 -mt-1">
              <Link to="/journal">
                <NotebookPen className="size-4" /> Saisir
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="flex items-center gap-6">
            {isLoading ? (
              <Skeleton className="size-36 rounded-full" />
            ) : (
              <>
                <ProgressRing
                  value={eaten}
                  max={goal ?? Math.max(eaten, 1)}
                  size={150}
                  label={formatNum(entry?.calories ?? null)}
                  sublabel="kcal"
                />
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-2">Restantes</p>
                    <p className={cn('num-display text-2xl', remaining != null && remaining < 0 && 'text-danger')}>
                      <AnimatedNumber value={remaining} format={(v) => formatNum(Math.round(v))} />
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-2">Objectif</p>
                    <p className="num-display text-lg">{formatNum(goal)} kcal</p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Macros */}
      <motion.div {...appear} transition={{ delay: 0.06 }}>
        <Card className="relative overflow-hidden">
          <div className="halo halo-slow pointer-events-none absolute -bottom-8 -right-10 size-36 rounded-full bg-violet/15 blur-3xl" />
          <CardHeader>
            <CardTitle>Macronutriments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <MacroBar label="Protéines" value={entry?.proteines ?? null} max={settings?.objectifProteines ?? null} color="var(--accent)" />
            <MacroBar label="Glucides" value={entry?.glucides ?? null} max={settings?.objectifGlucides ?? null} color="var(--violet)" />
            <MacroBar label="Lipides" value={entry?.lipides ?? null} max={settings?.objectifLipides ?? null} color="var(--warn)" />
          </CardContent>
        </Card>
      </motion.div>

      {/* Activité */}
      <motion.div {...appear} transition={{ delay: 0.09 }} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<Footprints className="size-5 text-accent" />}
          label="Pas"
          value={<AnimatedNumber value={entry?.pas ?? null} format={(v) => formatNum(Math.round(v))} />}
          goal={settings?.objectifPas ? `obj. ${formatNum(settings.objectifPas)}` : undefined}
        />
        <StatCard icon={<BedDouble className="size-5 text-violet" />} label="Sommeil" value={entry?.sommeil != null ? formatNum(entry.sommeil, 'h') : '—'} />
        <StatCard icon={<Zap className="size-5 text-warn" />} label="Forme" value={entry?.forme != null ? `${entry.forme}/10` : '—'} />
        <StatCard
          icon={weightDelta != null && weightDelta <= 0 ? <TrendingDown className="size-5 text-success" /> : <TrendingUp className="size-5 text-warn" />}
          label="Poids"
          value={formatKg(entry?.poids ?? lastWeight)}
        />
      </motion.div>

      {/* Récompenses */}
      <motion.div {...appear} transition={{ delay: 0.11 }}>
        <Card className="relative overflow-hidden">
          <div className="halo halo-delay pointer-events-none absolute -left-10 -top-8 size-36 rounded-full bg-warn/15 blur-3xl" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="size-4 text-warn" /> Récompenses
            </CardTitle>
            <span className="text-[11px] font-bold text-ink-2">
              {badges.filter((b) => b.debloque).length}/{badges.length}
            </span>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
              {badges.map((b, i) => (
                <BadgeChip key={b.id} badge={b} nouveau={nouveaux.includes(b.id)} index={i} />
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Prochaine séance */}
      <motion.div {...appear} transition={{ delay: 0.12 }}>
        <Card className="relative overflow-hidden">
          <div className="halo pointer-events-none absolute -bottom-10 -right-8 size-40 rounded-full bg-accent/15 blur-3xl" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Dumbbell className="size-4 text-violet" /> Sport
            </CardTitle>
          </CardHeader>
          <CardContent>
            {actif ? (
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-lg font-extrabold">{actif.nom}</p>
                  <p className="mt-0.5 text-sm text-ink-2">
                    {actif.exercices.length} exercices
                    {lastSeance && ` · dernière séance le ${formatShort(lastSeance.date)}`}
                  </p>
                </div>
                <Button asChild size="lg" className="glow-breathe">
                  <Link to="/seance-active">
                    <Play className="size-5" fill="currentColor" />
                    Commencer
                  </Link>
                </Button>
              </div>
            ) : (
              <EmptyState
                icon={<Dumbbell className="size-6" />}
                title="Aucun programme actif"
                description="Créez ou activez un programme depuis l'onglet Séances."
                action={
                  <Button asChild variant="secondary">
                    <Link to="/seances">Voir les programmes</Link>
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Tendances */}
      <motion.div {...appear} transition={{ delay: 0.15 }} className="grid gap-3 lg:grid-cols-2">
        <TrendCard title="Poids — 7 jours" unit="kg" data={weightSeries} color="var(--accent)" haloPos="-right-8 -top-8" />
        <TrendCard title="Calories — 7 jours" unit="kcal" data={calSeries} color="var(--violet)" haloPos="-left-8 -bottom-8" />
      </motion.div>
    </div>
  );
}

function BadgeChip({ badge, nouveau, index }: { badge: Badge; nouveau: boolean; index: number }) {
  const debloque = badge.debloque;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.15 + index * 0.04, type: 'spring', stiffness: 260, damping: 20 }}
      className={cn(
        'relative flex w-[118px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border p-3 text-center transition-colors',
        debloque ? 'border-accent/50 bg-accent/10' : 'border-line bg-bg-2/50',
      )}
    >
      {nouveau && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.6 + index * 0.04, type: 'spring', stiffness: 400, damping: 15 }}
          className="absolute -right-1.5 -top-1.5 rounded-full bg-warn px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-bg"
          style={{ boxShadow: '0 0 10px 2px color-mix(in srgb, var(--warn) 55%, transparent)' }}
        >
          Nouveau
        </motion.span>
      )}
      <div
        className={cn(
          'flex size-9 items-center justify-center rounded-full',
          debloque ? 'bg-accent text-on-accent' : 'bg-line/60 text-ink-2',
        )}
      >
        {debloque ? BADGE_ICONS[badge.icon] : <Lock className="size-4" />}
      </div>
      <p className={cn('text-[11px] font-bold leading-tight', !debloque && 'text-ink-2')}>{badge.nom}</p>
      {/* Progression */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-line/60">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.round(badge.progression * 100)}%` }}
          transition={{ delay: 0.3 + index * 0.04, duration: 0.7, ease: 'easeOut' }}
          className={cn('h-full rounded-full', debloque ? 'bg-accent' : 'bg-ink-2/50')}
        />
      </div>
      <p className="text-[9px] font-semibold text-ink-2">
        {debloque ? 'Débloqué' : `${badge.valeur}/${badge.seuil}`}
      </p>
    </motion.div>
  );
}

function StatCard({ icon, label, value, goal }: { icon: React.ReactNode; label: string; value: React.ReactNode; goal?: string }) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-2">{label}</span>
      </div>
      <p className="num-display text-2xl">{value}</p>
      {goal && <p className="mt-0.5 text-[11px] text-ink-2">{goal}</p>}
    </Card>
  );
}

function TrendCard({ title, unit, data, color, haloPos = '-right-8 -top-8' }: { title: string; unit: string; data: { date: string; value: number | null }[]; color: string; haloPos?: string }) {
  const hasData = data.some((d) => d.value !== null);
  return (
    <Card className="relative overflow-hidden p-4">
      <div
        className={cn('halo halo-slow pointer-events-none absolute size-28 rounded-full blur-3xl', haloPos)}
        style={{ background: `color-mix(in srgb, ${color} 40%, transparent)` }}
      />
      <p className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-2">{title}</p>
      {hasData ? (
        <ResponsiveContainer width="100%" height={80}>
          <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`g-${unit}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#g-${unit})`} connectNulls dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <p className="py-6 text-center text-sm text-ink-2">Pas encore de données</p>
      )}
    </Card>
  );
}
