import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { motion } from 'motion/react';
import { AlertTriangle, Check, Save } from 'lucide-react';
import { toast } from 'sonner';
import { JOURNAL_FIELDS, type JournalValues } from '@suivi/shared';
import { formatDateFr, formatKg, formatNum, formatShort, cn } from '@/lib/utils';
import { ApiError } from '@/lib/api';
import { useToday, useUpdateToday, useJournalRange } from '@/hooks/queries';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/misc';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';

type FormValues = Record<keyof JournalValues, string>;

const EMPTY_FORM: FormValues = {
  sommeil: '', forme: '', poids: '', calories: '', glucides: '',
  proteines: '', lipides: '', pas: '', entrainement: '',
};

function toForm(v: Partial<JournalValues>): FormValues {
  const out = { ...EMPTY_FORM };
  for (const k of Object.keys(out) as (keyof JournalValues)[]) {
    const x = v[k];
    out[k] = x == null ? '' : String(x);
  }
  return out;
}

function toValues(f: FormValues): Partial<JournalValues> {
  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
  const int = (s: string) => (s.trim() === '' ? null : Math.round(Number(s.replace(',', '.'))));
  return {
    sommeil: num(f.sommeil),
    forme: f.forme === '' ? null : Number(f.forme),
    poids: num(f.poids),
    calories: num(f.calories),
    glucides: num(f.glucides),
    proteines: num(f.proteines),
    lipides: num(f.lipides),
    pas: int(f.pas),
    entrainement: f.entrainement.trim() === '' ? null : f.entrainement.trim(),
  };
}

/** Contrôle visuel forme 1–10. */
function FormePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-10 gap-1">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(String(n))}
          className={cn(
            'h-10 rounded-lg border text-sm font-extrabold transition-all active:scale-95',
            value === String(n)
              ? 'border-accent bg-accent text-on-accent'
              : 'border-line bg-bg-2 text-ink-2 hover:border-ink-2/50 hover:text-ink',
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export function JournalPage() {
  const { data: today, isLoading } = useToday();
  const { data: recent } = useJournalRange(14);
  const update = useUpdateToday();
  const [conflict, setConflict] = useState<{ pending: Partial<JournalValues> } | null>(null);

  const form = useForm<FormValues>({ defaultValues: EMPTY_FORM });

  const base = useMemo(() => today?.entry ?? null, [today]);
  useEffect(() => {
    if (base) form.reset(toForm(base));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base?.date]);

  const submit = (f: FormValues, force = false) => {
    const values = toValues(f);
    // `base` = valeurs lues au chargement du formulaire → détection de conflit côté API.
    const b = base
      ? (Object.fromEntries(JOURNAL_FIELDS.map((k) => [k, base[k]])) as Partial<JournalValues>)
      : undefined;
    update.mutate(
      { values, base: b, force },
      {
        onSuccess: (r) => {
          setConflict(null);
          toast.success(
            r.written.length
              ? `Journée enregistrée (${r.written.join(', ')})`
              : 'Aucune modification',
          );
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 409) {
            setConflict({ pending: values });
          } else {
            toast.error(err instanceof ApiError ? err.message : 'Échec de l’enregistrement');
          }
        },
      },
    );
  };

  const past = useMemo(
    () => (recent ?? []).filter((e) => e.date !== today?.entry.date).slice(0, 10),
    [recent, today],
  );

  return (
    <div>
      <PageHeader
        title="Journal"
        subtitle={today ? formatDateFr(today.entry.date) : undefined}
      />

      {today?.rowMissing && (
        <Card className="mb-5 border-warn/40 bg-warn/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn" />
            <p className="text-sm text-ink">
              Aucune ligne n'existe pour aujourd'hui dans l'onglet <strong>Suivi</strong> du
              classeur. Ajoutez-la dans Google Sheets (date + n° de semaine), puis rechargez.
            </p>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Saisie du jour</CardTitle>
          {isLoading && <Skeleton className="h-4 w-24" />}
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit((f) => submit(f))}
            noValidate
            className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-3"
          >
            <div className="col-span-2 lg:col-span-3">
              <Label className="mb-2 block">Forme du jour</Label>
              <Controller
                control={form.control}
                name="forme"
                render={({ field }) => <FormePicker value={field.value} onChange={field.onChange} />}
              />
            </div>
            <Field label="Sommeil" suffix="h">
              <Input type="number" step="any" min="0" max="24" inputMode="decimal" suffix="h" {...form.register('sommeil')} />
            </Field>
            <Field label="Poids" suffix="kg">
              <Input type="number" step="any" inputMode="decimal" suffix="kg" {...form.register('poids')} />
            </Field>
            <Field label="Pas">
              <Input type="number" step="1" inputMode="numeric" {...form.register('pas')} />
            </Field>
            <Field label="Calories" suffix="kcal">
              <Input type="number" step="1" inputMode="numeric" suffix="kcal" {...form.register('calories')} />
            </Field>
            <Field label="Protéines" suffix="g">
              <Input type="number" step="1" inputMode="numeric" suffix="g" {...form.register('proteines')} />
            </Field>
            <Field label="Glucides" suffix="g">
              <Input type="number" step="1" inputMode="numeric" suffix="g" {...form.register('glucides')} />
            </Field>
            <Field label="Lipides" suffix="g">
              <Input type="number" step="1" inputMode="numeric" suffix="g" {...form.register('lipides')} />
            </Field>
            <Field label="Entraînement">
              <Input type="text" placeholder="Ex. Full body, Repos…" {...form.register('entrainement')} />
            </Field>
            <div className="col-span-2 pt-1 lg:col-span-3">
              <Button type="submit" size="lg" className="w-full lg:w-auto" loading={update.isPending} disabled={today?.rowMissing}>
                <Save className="size-5" />
                Enregistrer la journée
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Historique récent — lecture seule */}
      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Jours précédents</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-line/60 p-0 px-5 pb-2">
          {past.length === 0 && (
            <p className="py-6 text-center text-sm text-ink-2">Aucune donnée sur les jours passés.</p>
          )}
          {past.map((e) => {
            const filled = [e.poids, e.calories, e.pas, e.sommeil].some((v) => v !== null);
            return (
              <div key={e.date} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-bold capitalize">{formatShort(e.date)} — {formatDateFr(e.date).split(' ')[0]}</p>
                  <p className="text-xs text-ink-2">
                    {filled
                      ? [
                          e.poids != null && formatKg(e.poids),
                          e.calories != null && `${e.calories} kcal`,
                          e.pas != null && `${formatNum(e.pas)} pas`,
                          e.entrainement,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : 'Aucune donnée'}
                  </p>
                </div>
                {filled && <Check className="size-4 text-success" />}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Conflit de modification */}
      <Dialog open={conflict !== null} onOpenChange={(o) => !o && setConflict(null)}>
        <DialogContent>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-warn" /> Données modifiées ailleurs
          </DialogTitle>
          <DialogDescription>
            Certaines valeurs du jour ont été modifiées depuis un autre écran (ou dans Google
            Sheets). Écraser avec vos valeurs ?
          </DialogDescription>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConflict(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              loading={update.isPending}
              onClick={() => {
                if (conflict) submit(form.getValues(), true);
              }}
            >
              Écraser les valeurs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, suffix, children }: { label: string; suffix?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-2 block">{label}</Label>
      {children}
    </div>
  );
}
