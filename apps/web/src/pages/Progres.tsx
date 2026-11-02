import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingDown, TrendingUp } from 'lucide-react';
import {
  addDays,
  average,
  exerciseProgress,
  movingAverage,
  seriesByDay,
  sessionVolume,
  todayInTimezone,
  weeklyAverage,
} from '@suivi/shared';
import { useExercices, useJournalRange, useParametres, useSeances } from '@/hooks/queries';
import { formatKg, formatNum, formatShort } from '@/lib/utils';
import { getBuild } from '@/lib/body';
import { BodyMap } from '@/components/BodyMap';
import { PhotosTab } from '@/components/PhotosTab';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/misc';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const AXIS = { stroke: 'var(--ink-2)', fontSize: 10, tickLine: false, axisLine: false } as const;
const GRID = { stroke: 'var(--line)', strokeDasharray: '3 3', vertical: false } as const;
const TOOLTIP_STYLE = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--line)',
  borderRadius: '12px',
  fontSize: 12,
  color: 'var(--ink)',
} as const;

const PERIODES = [
  { jours: 14, label: '14 j' },
  { jours: 30, label: '30 j' },
  { jours: 90, label: '90 j' },
  { jours: 365, label: '1 an' },
] as const;

export function ProgresPage() {
  const [jours, setJours] = useState(30);
  const { data: journal } = useJournalRange(jours);
  const { data: settings } = useParametres();
  const { data: seances } = useSeances();
  const { data: exercices } = useExercices();
  const today = todayInTimezone();

  const entries = useMemo(() => (journal ?? []).filter((e) => e.date <= today), [journal, today]);
  const seancesPeriode = useMemo(
    () => (seances ?? []).filter((s) => s.date >= addDays(today, -jours)),
    [seances, today, jours],
  );

  return (
    <div>
      <PageHeader
        title="Progrès"
        subtitle={`Statistiques sur ${jours} jours`}
        actions={
          <div className="flex gap-1 rounded-xl border border-line bg-bg-2 p-1">
            {PERIODES.map((p) => (
              <button
                key={p.jours}
                onClick={() => setJours(p.jours)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
                  jours === p.jours ? 'bg-accent text-on-accent' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />
      <Tabs defaultValue="poids">
        <TabsList className="mb-5 flex w-full flex-wrap justify-start">
          <TabsTrigger value="poids">Poids</TabsTrigger>
          <TabsTrigger value="nutrition">Nutrition</TabsTrigger>
          <TabsTrigger value="activite">Activité</TabsTrigger>
          <TabsTrigger value="muscu">Musculation</TabsTrigger>
          <TabsTrigger value="photos">Photos</TabsTrigger>
        </TabsList>

        <TabsContent value="poids">
          <PoidsTab entries={entries} today={today} jours={jours} objectif={settings?.objectifPoids ?? null} depart={settings?.poidsDepart ?? null} />
        </TabsContent>
        <TabsContent value="nutrition">
          <NutritionTab entries={entries} today={today} jours={jours} settings={settings} />
        </TabsContent>
        <TabsContent value="activite">
          <ActiviteTab entries={entries} today={today} jours={jours} seances={seancesPeriode} />
        </TabsContent>
        <TabsContent value="muscu">
          <MuscuTab seances={seancesPeriode} exercices={exercices ?? []} />
        </TabsContent>
        <TabsContent value="photos">
          <PhotosTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Poids ----------

function PoidsTab({ entries, today, jours, objectif, depart }: { entries: import('@suivi/shared').JournalEntry[]; today: string; jours: number; objectif: number | null; depart: number | null }) {
  const series = seriesByDay(entries, 'poids', jours, today);
  const ma7 = movingAverage(series, 7);
  const chart = series.map((p, i) => ({ ...p, ma7: ma7[i]!.value }));
  const weekly = weeklyAverage(series);
  const last = [...series].reverse().find((p) => p.value !== null)?.value ?? null;
  const deltaDepart = last != null && depart != null ? last - depart : null;
  const restant = last != null && objectif != null ? last - objectif : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Actuel" value={formatKg(last)} />
        <Stat label="Depuis départ" value={deltaDepart == null ? '—' : `${deltaDepart > 0 ? '+' : ''}${deltaDepart.toFixed(1)} kg`} tone={deltaDepart != null ? (deltaDepart <= 0 ? 'good' : 'warn') : undefined} icon={deltaDepart != null ? (deltaDepart <= 0 ? <TrendingDown className="size-3.5" /> : <TrendingUp className="size-3.5" />) : undefined} />
        <Stat label="Reste obj." value={restant == null ? '—' : `${restant > 0 ? '+' : ''}${restant.toFixed(1)} kg`} />
      </div>
      <Card>
        <CardHeader><CardTitle>Poids quotidien + moyenne mobile 7 j</CardTitle></CardHeader>
        <CardContent>
          {series.some((p) => p.value !== null) ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chart} margin={{ top: 4, right: 4, bottom: 0, left: -14 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="date" tickFormatter={formatShort} {...AXIS} interval="preserveStartEnd" minTickGap={40} />
                <YAxis domain={['dataMin - 1', 'dataMax + 1']} {...AXIS} tickFormatter={(v: number) => v.toFixed(1)} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(d) => formatShort(String(d))} formatter={(v: number, name: string) => [v?.toFixed?.(1) + ' kg', name === 'ma7' ? 'Moy. 7 j' : 'Poids']} />
                <Area type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} fill="var(--accent)" fillOpacity={0.08} connectNulls={false} dot={{ r: 2, fill: 'var(--accent)' }} name="Poids" />
                <Line type="monotone" dataKey="ma7" stroke="var(--violet)" strokeWidth={2} dot={false} connectNulls name="Moy. 7 j" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="Pas de données de poids" description="Renseignez votre poids dans le Journal." />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Moyenne hebdomadaire</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={weekly} margin={{ top: 4, right: 4, bottom: 0, left: -14 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="weekStart" tickFormatter={formatShort} {...AXIS} />
              <YAxis domain={['dataMin - 1', 'dataMax + 1']} {...AXIS} tickFormatter={(v: number) => v.toFixed(1)} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v?.toFixed?.(1) + ' kg', 'Moyenne']} labelFormatter={(d) => `Sem. du ${formatShort(String(d))}`} />
              <Bar dataKey="value" fill="var(--violet)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Nutrition ----------

function NutritionTab({ entries, today, jours, settings }: { entries: import('@suivi/shared').JournalEntry[]; today: string; jours: number; settings: import('@suivi/shared').UserSettings | undefined }) {
  const cal = seriesByDay(entries, 'calories', jours, today);
  const avgCal = average(entries.map((e) => e.calories));
  const avgP = average(entries.map((e) => e.proteines));
  const avgG = average(entries.map((e) => e.glucides));
  const avgL = average(entries.map((e) => e.lipides));
  const weekly = weeklyAverage(cal);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Calories moy." value={avgCal != null ? `${Math.round(avgCal)} kcal` : '—'} sub={`obj. ${formatNum(settings?.objectifCalories)}`} />
        <Card className="p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-2">Macros moy. (g)</p>
          <p className="mt-1.5 text-sm font-bold">
            <span className="text-accent">P {avgP != null ? Math.round(avgP) : '—'}</span>
            <span className="text-ink-2"> · </span>
            <span className="text-violet">G {avgG != null ? Math.round(avgG) : '—'}</span>
            <span className="text-ink-2"> · </span>
            <span className="text-warn">L {avgL != null ? Math.round(avgL) : '—'}</span>
          </p>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Calories quotidiennes vs objectif</CardTitle></CardHeader>
        <CardContent>
          {cal.some((p) => p.value !== null) ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={cal} margin={{ top: 4, right: 4, bottom: 0, left: -14 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="date" tickFormatter={formatShort} {...AXIS} minTickGap={40} />
                <YAxis {...AXIS} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v} kcal`, 'Calories']} labelFormatter={(d) => formatShort(String(d))} />
                {settings?.objectifCalories != null && (
                  <Line type="monotone" dataKey={() => settings.objectifCalories} stroke="var(--accent)" strokeDasharray="5 4" dot={false} strokeWidth={1.5} name="Objectif" />
                )}
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {cal.map((p, i) => (
                    <Cell key={i} fill={settings?.objectifCalories != null && p.value != null && p.value > settings.objectifCalories ? 'var(--warn)' : 'var(--accent)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="Pas de données nutrition" description="Renseignez calories et macros dans le Journal." />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Tendance hebdomadaire</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={weekly} margin={{ top: 4, right: 4, bottom: 0, left: -14 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="weekStart" tickFormatter={formatShort} {...AXIS} />
              <YAxis {...AXIS} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${Math.round(v)} kcal`, 'Moyenne']} labelFormatter={(d) => `Sem. du ${formatShort(String(d))}`} />
              <Bar dataKey="value" fill="var(--violet)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Activité ----------

function ActiviteTab({ entries, today, jours, seances }: { entries: import('@suivi/shared').JournalEntry[]; today: string; jours: number; seances: import('@suivi/shared').Session[] }) {
  const pas = seriesByDay(entries, 'pas', jours, today);
  const sommeil = seriesByDay(entries, 'sommeil', jours, today);
  const forme = seriesByDay(entries, 'forme', jours, today);
  const semaines = new Set(
    seances.filter((s) => s.statut === 'terminee').map((s) => s.date.slice(0, 8)),
  ).size;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Pas moy." value={average(entries.map((e) => e.pas)) != null ? formatNum(Math.round(average(entries.map((e) => e.pas))!)) : '—'} />
        <Stat label="Sommeil moy." value={average(entries.map((e) => e.sommeil)) != null ? `${average(entries.map((e) => e.sommeil))!.toFixed(1)} h` : '—'} />
        <Stat label="Séances" value={String(seances.filter((s) => s.statut === 'terminee').length)} sub={`${semaines} périodes`} />
      </div>
      <ChartCard title="Pas quotidiens" data={pas} color="var(--accent)" unit="pas" />
      <ChartCard title="Sommeil (h)" data={sommeil} color="var(--violet)" unit="h" />
      <ChartCard title="Forme ressentie (1–10)" data={forme} color="var(--warn)" unit="/10" domain={[0, 10]} />
    </div>
  );
}

// ---------- Musculation ----------

function MuscuTab({ seances, exercices }: { seances: import('@suivi/shared').Session[]; exercices: import('@suivi/shared').Exercise[] }) {
  const done = seances.filter((s) => s.statut === 'terminee');
  const exoNames = useMemo(
    () => [...new Set(done.flatMap((s) => s.exercices.map((e) => e.exercice)))],
    [done],
  );
  const [exo, setExo] = useState<string>('');
  const selected = exo || exoNames[0] || '';
  const prog = (selected ? exerciseProgress(done, selected) : []).map((p) => ({
    ...p,
    e1rm:
      p.repetitions != null && p.repetitions > 0
        ? Math.round(p.chargeKg * (1 + p.repetitions / 30) * 10) / 10
        : p.chargeKg,
  }));
  const volumes = done
    .map((s) => ({ date: s.date, volume: Math.round(sessionVolume(s)) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Heat map : nb de séries complétées par groupe musculaire (normalisé 0–1)
  const muscleIntensity = useMemo(() => {
    const muscleByExo = new Map(exercices.map((e) => [e.nom, e.muscle]));
    const counts = new Map<string, number>();
    for (const s of done) {
      for (const exo of s.exercices) {
        const muscle = muscleByExo.get(exo.exercice);
        if (!muscle) continue;
        const doneSets = exo.sets.filter((st) => st.terminee).length;
        if (doneSets > 0) counts.set(muscle, (counts.get(muscle) ?? 0) + doneSets);
      }
    }
    const max = Math.max(0, ...counts.values());
    const out: Record<string, number> = {};
    for (const [m, c] of counts) out[m] = max > 0 ? c / max : 0;
    return out;
  }, [done, exercices]);
  const topMuscles = useMemo(
    () => Object.entries(muscleIntensity).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([m]) => m),
    [muscleIntensity],
  );

  if (!done.length) {
    return <EmptyState title="Aucune séance enregistrée" description="Terminez une séance pour voir votre progression ici." />;
  }
  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden">
        <div className="halo halo-slow pointer-events-none absolute -left-12 top-1/3 size-48 rounded-full bg-accent/30 blur-3xl" />
        <div className="halo halo-delay pointer-events-none absolute -right-10 top-1/4 size-40 rounded-full bg-violet/25 blur-3xl" />
        <CardHeader><CardTitle>Muscles les plus sollicités</CardTitle></CardHeader>
        <CardContent>
          <BodyMap intensities={muscleIntensity} build={getBuild()} height={230} labels />
          {/* Légende thermique */}
          <div className="mx-auto mt-3 flex max-w-[240px] items-center gap-2">
            <span className="text-[10px] font-bold uppercase text-ink-2">Peu</span>
            <div
              className="h-2 flex-1 rounded-full"
              style={{ background: 'linear-gradient(90deg, var(--violet), var(--accent), var(--warn), var(--danger))' }}
            />
            <span className="text-[10px] font-bold uppercase text-ink-2">Beaucoup</span>
          </div>
          <p className="mt-2 text-center text-[11px] text-ink-2">
            {topMuscles.length
              ? `Top : ${topMuscles.join(' · ')}`
              : 'Aucune série sur la période'}
            {' '}— d'après les séries complétées sur la période
          </p>
        </CardContent>
      </Card>
      <Select value={selected} onValueChange={setExo}>
        <SelectTrigger><SelectValue placeholder="Choisir un exercice" /></SelectTrigger>
        <SelectContent>
          {exoNames.map((n) => (
            <SelectItem key={n} value={n}>{n}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Card>
        <CardHeader><CardTitle>Meilleure charge — {selected}</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={prog} margin={{ top: 4, right: 4, bottom: 0, left: -14 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="date" tickFormatter={formatShort} {...AXIS} />
              <YAxis domain={['dataMin - 2', 'dataMax + 2']} {...AXIS} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number, _n, item) => [
                  `${v} kg${item?.payload?.repetitions != null ? ` × ${item.payload.repetitions} reps` : ''}`,
                  'Meilleure série',
                ]}
                labelFormatter={(d) => formatShort(String(d))}
              />
              <Line type="monotone" dataKey="chargeKg" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3.5, fill: 'var(--accent)' }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>1RM estimé — {selected}</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={prog} margin={{ top: 4, right: 4, bottom: 0, left: -14 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="date" tickFormatter={formatShort} {...AXIS} />
              <YAxis domain={['dataMin - 2', 'dataMax + 2']} {...AXIS} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number, _n, item) => [
                  `${v} kg`,
                  `1RM est. (${item?.payload?.chargeKg} kg × ${item?.payload?.repetitions ?? '?'} reps)`,
                ]}
                labelFormatter={(d) => formatShort(String(d))}
              />
              <Line type="monotone" dataKey="e1rm" stroke="var(--violet)" strokeWidth={2.5} dot={{ r: 3.5, fill: 'var(--violet)' }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Volume par séance (kg)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={volumes} margin={{ top: 4, right: 4, bottom: 0, left: -14 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="date" tickFormatter={formatShort} {...AXIS} />
              <YAxis {...AXIS} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v} kg`, 'Volume']} labelFormatter={(d) => formatShort(String(d))} />
              <Bar dataKey="volume" fill="var(--violet)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Communs ----------

function Stat({ label, value, sub, tone, icon }: { label: string; value: string; sub?: string; tone?: 'good' | 'warn'; icon?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-2">{label}</p>
      <p className={`num-display mt-1 flex items-center justify-center gap-1 text-xl ${tone === 'good' ? 'text-success' : tone === 'warn' ? 'text-warn' : ''}`}>
        {icon}{value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-ink-2">{sub}</p>}
    </Card>
  );
}

function ChartCard({ title, data, color, unit, domain }: { title: string; data: { date: string; value: number | null }[]; color: string; unit: string; domain?: [number, number] }) {
  const has = data.some((p) => p.value !== null);
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {has ? (
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -14 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="date" tickFormatter={formatShort} {...AXIS} minTickGap={40} />
              <YAxis {...AXIS} domain={domain ?? ['auto', 'auto']} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v} ${unit}`, title.split(' ')[0]]} labelFormatter={(d) => formatShort(String(d))} />
              <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`${color}22`} connectNulls={false} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-8 text-center text-sm text-ink-2">Pas de données sur la période.</p>
        )}
      </CardContent>
    </Card>
  );
}
