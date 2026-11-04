import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { Check, FileSpreadsheet, KeyRound, LogOut, Palette, PersonStanding, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { LinkSheetResult, UserSettings } from '@suivi/shared';
import { useParametres, useSaveParametres, useMeta, useMe, useChangePassword } from '@/hooks/queries';
import { api, ApiError, setToken } from '@/lib/api';
import { applyTheme, getTheme, THEMES, type ThemeId } from '@/lib/theme';
import { GENDERS, getBuild, setBuild, type BuildId } from '@/lib/body';
import { BodyMap } from '@/components/BodyMap';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/misc';

function logout() {
  setToken(null);
  window.dispatchEvent(new Event('suivid:unauthorized'));
}

/** Carte compte + classeur lié (reliage possible). */
function CompteCard() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const relink = async () => {
    setBusy(true);
    try {
      const r = await api.post<LinkSheetResult>('/me/spreadsheet', { url });
      toast.success('Classeur lié — onglets : ' + (r.created.length ? r.created.join(', ') : 'déjà complets'));
      setUrl('');
      void qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Liaison impossible');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><FileSpreadsheet className="size-5" /> Compte & classeur</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{me.email}</p>
            <p className="text-xs text-ink-2">
              {me.mode === 'mock'
                ? 'Mode démo — aucun classeur nécessaire'
                : me.spreadsheetId
                  ? `Classeur lié : ${me.spreadsheetId}`
                  : 'Aucun classeur lié'}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={logout}>
            <LogOut className="size-4" /> Déconnexion
          </Button>
        </div>
        {me.mode === 'sheets' && (
          <div>
            <Label className="mb-2 block">Changer de classeur</Label>
            <div className="flex gap-2">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                inputMode="url"
              />
              <Button variant="secondary" loading={busy} disabled={url.trim().length < 5} onClick={relink}>
                Lier
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-ink-2">
              Partage le nouveau classeur avec <span className="font-semibold">{me.serviceAccountEmail ?? 'le compte de service'}</span> (éditeur) avant de le lier.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Choix du thème visuel — préférence locale à l'appareil. */
function ThemeCard() {
  const [theme, setTheme] = useState<ThemeId>(getTheme);
  const pick = (id: ThemeId) => {
    setTheme(id);
    applyTheme(id);
    toast.success(`Thème « ${THEMES.find((t) => t.id === id)?.nom} » appliqué`);
  };
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Palette className="size-5" /> Apparence</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => pick(t.id)}
              className={`group rounded-2xl border p-3 text-left transition-all ${
                theme === t.id ? 'border-accent ring-1 ring-accent/50' : 'border-line hover:border-ink-2/50'
              }`}
            >
              <div className="mb-2 flex h-16 overflow-hidden rounded-xl border border-line/50" style={{ background: t.swatches[0] }}>
                <div className="h-full flex-1 p-1.5">
                  <div className="h-full w-full rounded-lg" style={{ background: t.swatches[1] }} />
                </div>
                <div className="flex items-center justify-center px-3" style={{ background: t.swatches[0] }}>
                  <div className="size-4 rounded-full" style={{ background: t.swatches[2] }} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">{t.nom}</p>
                {theme === t.id && <Check className="size-4 text-accent" />}
              </div>
              <p className="text-[11px] text-ink-2">{t.desc}</p>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-ink-2">Préférence enregistrée sur cet appareil.</p>
      </CardContent>
    </Card>
  );
}

/** Morphologie de la silhouette affichée dans les fiches exercices. */
function MorphoCard() {
  const [build, setBuildState] = useState<BuildId>(getBuild);
  const pick = (id: BuildId) => {
    setBuildState(id);
    setBuild(id);
    toast.success(`Morphologie « ${GENDERS.find((b) => b.id === id)?.nom} »`);
  };
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><PersonStanding className="size-5" /> Morphologie</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {GENDERS.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => pick(b.id)}
              className={`rounded-2xl border p-3 text-center transition-all ${
                build === b.id ? 'border-accent ring-1 ring-accent/50' : 'border-line hover:border-ink-2/50'
              }`}
            >
              <BodyMap build={b.id} height={150} />
              <p className="mt-2 flex items-center justify-center gap-1 text-sm font-bold">
                {b.nom}
                {build === b.id && <Check className="size-4 text-accent" />}
              </p>
              <p className="text-[11px] text-ink-2">{b.desc}</p>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-ink-2">
          Silhouette utilisée dans la fiche « muscles travaillés » et la heat map de progression.
        </p>
      </CardContent>
    </Card>
  );
}

type Form = Record<Exclude<keyof UserSettings, 'unite' | 'timezone' | 'reposDefautSec'>, string> & {
  reposDefautSec: string;
  timezone: string;
};

/** Changement de mot de passe — vérification de l'actuel côté serveur. */
function MotDePasseCard() {
  const change = useChangePassword();
  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirm, setConfirm] = useState('');

  const submit = async () => {
    if (nouveau !== confirm) {
      toast.error('Les deux nouveaux mots de passe ne correspondent pas');
      return;
    }
    try {
      await change.mutateAsync({ actuel, nouveau });
      toast.success('Mot de passe modifié');
      setActuel('');
      setNouveau('');
      setConfirm('');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Modification impossible');
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="size-5" /> Mot de passe</CardTitle></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <Field label="Actuel">
          <Input type="password" autoComplete="current-password" value={actuel} onChange={(e) => setActuel(e.target.value)} />
        </Field>
        <Field label="Nouveau (4+ caractères)">
          <Input type="password" autoComplete="new-password" value={nouveau} onChange={(e) => setNouveau(e.target.value)} />
        </Field>
        <Field label="Confirmer">
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <div className="sm:col-span-3">
          <Button onClick={submit} loading={change.isPending} disabled={!actuel || nouveau.length < 4 || !confirm}>
            <KeyRound className="size-4" /> Modifier le mot de passe
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ParametresPage() {
  const { data: settings, isLoading } = useParametres();
  const { data: meta } = useMeta();
  const save = useSaveParametres();
  const form = useForm<Form>();

  useEffect(() => {
    if (settings) {
      form.reset({
        objectifPoids: settings.objectifPoids?.toString() ?? '',
        objectifCalories: settings.objectifCalories?.toString() ?? '',
        objectifProteines: settings.objectifProteines?.toString() ?? '',
        objectifGlucides: settings.objectifGlucides?.toString() ?? '',
        objectifLipides: settings.objectifLipides?.toString() ?? '',
        objectifPas: settings.objectifPas?.toString() ?? '',
        poidsDepart: settings.poidsDepart?.toString() ?? '',
        reposDefautSec: String(settings.reposDefautSec),
        timezone: settings.timezone,
        nomAffiche: settings.nomAffiche ?? '',
      });
    }
  }, [settings, form]);

  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

  const submit = async (f: Form) => {
    const payload: UserSettings = {
      objectifPoids: num(f.objectifPoids),
      objectifCalories: num(f.objectifCalories),
      objectifProteines: num(f.objectifProteines),
      objectifGlucides: num(f.objectifGlucides),
      objectifLipides: num(f.objectifLipides),
      objectifPas: num(f.objectifPas),
      poidsDepart: num(f.poidsDepart),
      reposDefautSec: num(f.reposDefautSec) ?? 90,
      unite: 'kg',
      timezone: f.timezone || 'Europe/Paris',
      nomAffiche: f.nomAffiche?.trim() || null,
      // Champs gérés par le coach — on préserve les valeurs existantes.
      tailleCm: settings?.tailleCm ?? null,
      dateNaissance: settings?.dateNaissance ?? null,
      noteCoach: settings?.noteCoach ?? null,
      joursSeance: settings?.joursSeance ?? [],
    };
    try {
      await save.mutateAsync(payload);
      toast.success('Paramètres enregistrés');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Enregistrement impossible');
    }
  };

  return (
    <div>
      <PageHeader title="Paramètres" subtitle="Objectifs et préférences — stockés dans l'onglet Parametres" />
      <div className="mb-5 space-y-5">
        <CompteCard />
        <MotDePasseCard />
        <ThemeCard />
        <MorphoCard />
      </div>
      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <form onSubmit={form.handleSubmit(submit)} className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Profil</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <Field label="Nom affiché"><Input type="text" placeholder="Ton prénom" {...form.register('nomAffiche')} /></Field>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Objectifs quotidiens</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <Field label="Calories" suffix="kcal"><Input type="number" suffix="kcal" inputMode="numeric" {...form.register('objectifCalories')} /></Field>
              <Field label="Protéines" suffix="g"><Input type="number" suffix="g" inputMode="numeric" {...form.register('objectifProteines')} /></Field>
              <Field label="Glucides" suffix="g"><Input type="number" suffix="g" inputMode="numeric" {...form.register('objectifGlucides')} /></Field>
              <Field label="Lipides" suffix="g"><Input type="number" suffix="g" inputMode="numeric" {...form.register('objectifLipides')} /></Field>
              <Field label="Pas"><Input type="number" inputMode="numeric" {...form.register('objectifPas')} /></Field>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Poids & séance</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <Field label="Poids de départ" suffix="kg"><Input type="number" step="0.1" suffix="kg" inputMode="decimal" {...form.register('poidsDepart')} /></Field>
              <Field label="Objectif de poids" suffix="kg"><Input type="number" step="0.1" suffix="kg" inputMode="decimal" {...form.register('objectifPoids')} /></Field>
              <Field label="Repos entre séries" suffix="s"><Input type="number" suffix="s" inputMode="numeric" {...form.register('reposDefautSec')} /></Field>
              <Field label="Fuseau horaire"><Input type="text" placeholder="Europe/Paris" {...form.register('timezone')} /></Field>
            </CardContent>
          </Card>
          <Card className="border-line bg-bg-2/50">
            <CardContent className="flex items-center justify-between p-4 text-xs text-ink-2">
              <span>
                Mode : <strong className={meta?.mode === 'mock' ? 'text-warn' : 'text-success'}>{meta?.mode === 'mock' ? 'Démo (données fictives)' : 'Google Sheets'}</strong>
              </span>
              <span>Unité : kg · kg×reps pour le volume</span>
            </CardContent>
          </Card>
          <Button type="submit" size="lg" className="w-full lg:w-auto" loading={save.isPending}>
            <Save className="size-5" /> Enregistrer les paramètres
          </Button>
        </form>
      )}
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
