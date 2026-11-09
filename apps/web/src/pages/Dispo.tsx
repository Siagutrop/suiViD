// ------------------------------------------------------------------
// Section « Dispos salle » — agenda partagé des créneaux d'entraînement
// entre clients du même coach : calendrier mensuel + liste complète.
// Intégrée dans la page Séances (onglet Dispos).
// ------------------------------------------------------------------

import { useMemo, useState } from 'react';
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { todayInTimezone } from '@suivi/shared';
import {
  useCreerRdv,
  useMe,
  useQuitterRdv,
  useRejoindreRdv,
  useRendezVous,
  useSupprimerRdv,
} from '@/hooks/queries';
import { RdvDialog, RdvLigne } from '@/components/RendezVous';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn, formatDateFr } from '@/lib/utils';

const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** Calendrier mensuel compact — point sur les jours avec créneau. */
function MiniCal({ mois, parJour, jourSel, onSelect }: {
  mois: string; // 'YYYY-MM'
  parJour: Map<string, number>;
  jourSel: string | null;
  onSelect: (d: string | null) => void;
}) {
  const an = Number(mois.slice(0, 4));
  const mo = Number(mois.slice(5, 7));
  const nbJours = new Date(an, mo, 0).getDate();
  // Décalage : 0 = lundi pour coller à JOURS.
  const decal = (new Date(an, mo - 1, 1).getDay() + 6) % 7;
  const today = todayInTimezone();
  const cellules: (string | null)[] = [
    ...Array.from({ length: decal }, () => null),
    ...Array.from({ length: nbJours }, (_, i) => `${mois}-${String(i + 1).padStart(2, '0')}`),
  ];
  return (
    <div className="grid grid-cols-7 gap-1 text-center">
      {JOURS.map((j, i) => <span key={i} className="text-[10px] font-bold uppercase text-ink-2">{j}</span>)}
      {cellules.map((d, i) =>
        d === null ? (
          <span key={`v${i}`} />
        ) : (
          <button
            key={d}
            disabled={d < today}
            onClick={() => onSelect(jourSel === d ? null : d)}
            className={cn(
              'relative flex aspect-square flex-col items-center justify-center rounded-lg text-xs transition-colors',
              d < today && 'opacity-30',
              d === today && 'font-extrabold text-accent ring-1 ring-accent/40',
              jourSel === d ? 'bg-accent text-white' : (parJour.get(d) ?? 0) > 0 ? 'bg-accent/10 font-bold' : 'text-ink-2 hover:bg-bg-3',
            )}
          >
            {Number(d.slice(8))}
            {(parJour.get(d) ?? 0) > 0 && (
              <span className={cn('absolute bottom-1 size-1 rounded-full', jourSel === d ? 'bg-white' : 'bg-accent')} />
            )}
          </button>
        ),
      )}
    </div>
  );
}

export function DispoSection() {
  const { data: me } = useMe();
  const { data: rdvs } = useRendezVous();
  const creer = useCreerRdv();
  const rejoindre = useRejoindreRdv();
  const quitter = useQuitterRdv();
  const supprimer = useSupprimerRdv();
  const [dialog, setDialog] = useState(false);
  const [jourSel, setJourSel] = useState<string | null>(null);
  const [mois, setMois] = useState(todayInTimezone().slice(0, 7));

  const parJour = useMemo(() => {
    const m = new Map<string, number>();
    (rdvs ?? []).forEach((r) => m.set(r.date, (m.get(r.date) ?? 0) + 1));
    return m;
  }, [rdvs]);

  const liste = (rdvs ?? []).filter((r) => !jourSel || r.date === jourSel);
  const navMois = (delta: number) => {
    const d = new Date(Number(mois.slice(0, 4)), Number(mois.slice(5, 7)) - 1 + delta, 1);
    setMois(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const moisLabel = new Date(Number(mois.slice(0, 4)), Number(mois.slice(5, 7)) - 1, 1)
    .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-ink-2">
          Créneaux d'entraînement partagés entre clients du coach — rejoins celles qui t'arrangent.
        </p>
        <Button size="sm" className="shrink-0" onClick={() => setDialog(true)}>
          <CalendarPlus className="size-4" /> Ma dispo
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,17rem)_1fr]">
        {/* Calendrier mensuel */}
        <Card className="h-fit">
          <CardContent className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <button onClick={() => navMois(-1)} className="rounded-md p-1 text-ink-2 hover:bg-bg-3" aria-label="Mois précédent">
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-sm font-bold capitalize">{moisLabel}</span>
              <button onClick={() => navMois(1)} className="rounded-md p-1 text-ink-2 hover:bg-bg-3" aria-label="Mois suivant">
                <ChevronRight className="size-4" />
              </button>
            </div>
            <MiniCal mois={mois} parJour={parJour} jourSel={jourSel} onSelect={setJourSel} />
            {jourSel && (
              <button className="mt-2 w-full text-xs font-bold text-accent" onClick={() => setJourSel(null)}>
                Tout voir
              </button>
            )}
          </CardContent>
        </Card>

        {/* Agenda */}
        <div className="space-y-2">
          {jourSel && (
            <p className="flex items-center gap-1.5 text-xs font-bold capitalize text-ink-2">
              <CalendarDays className="size-3.5" /> {formatDateFr(jourSel)}
            </p>
          )}
          {liste.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center">
                <CalendarDays className="mx-auto mb-2 size-8 text-ink-2/40" />
                <p className="text-sm text-ink-2">
                  {jourSel ? 'Aucune dispo ce jour-là.' : "Personne n'a publié de dispo — sois le premier !"}
                </p>
                <Button variant="secondary" size="sm" className="mt-3" onClick={() => setDialog(true)}>
                  <MapPin className="size-4" /> Publier ma dispo
                </Button>
              </CardContent>
            </Card>
          )}
          {liste.map((r) => (
            <RdvLigne
              key={r.id}
              rdv={r}
              moiId={me?.id}
              onRejoindre={(id) => rejoindre.mutate(id)}
              onQuitter={(id) => quitter.mutate(id)}
              onSupprimer={(id) => supprimer.mutate(id)}
            />
          ))}
        </div>
      </div>

      <RdvDialog
        open={dialog}
        onClose={() => setDialog(false)}
        pending={creer.isPending}
        initialDate={jourSel ?? undefined}
        onSubmit={(i) => creer.mutateAsync(i)}
      />
    </div>
  );
}
