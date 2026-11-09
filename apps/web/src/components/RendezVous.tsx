// ------------------------------------------------------------------
// Rendez-vous entre clients — « je suis dispo à la salle X à telle
// heure ». Créneaux partagés visibles par tous les clients du coach ;
// chacun peut rejoindre ou quitter. Aucun rôle pour le coach.
// ------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { todayInTimezone } from '@suivi/shared';
import { CalendarPlus, Clock, MapPin, Trash2, UserPlus, UserMinus, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { RendezVous } from '@suivi/shared';
import { formatDateFr } from '@/lib/utils';
import { ApiError } from '@/lib/api';
import type { RdvInput } from '@/hooks/queries';
import { Badge } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

/** Ligne de créneau : date, heure, salle, créateur, participants + actions. */
export function RdvLigne({
  rdv,
  moiId,
  onRejoindre,
  onQuitter,
  onSupprimer,
}: {
  rdv: RendezVous;
  moiId: string | undefined;
  onRejoindre: (id: string) => void;
  onQuitter: (id: string) => void;
  onSupprimer: (id: string) => void;
}) {
  const mien = rdv.userId === moiId;
  const dedans = rdv.participants.some((p) => p.userId === moiId);
  const noms = rdv.participants.map((p) => p.nom ?? '?').join(', ');
  return (
    <div className="rounded-xl border border-line bg-bg-2/40 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 flex-col items-center justify-center rounded-lg bg-accent/10 text-accent">
          <span className="text-[9px] font-bold uppercase leading-none">
            {['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'][Number(rdv.date.slice(5, 7)) - 1]}
          </span>
          <span className="text-sm font-extrabold leading-tight">{rdv.date.slice(8)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="flex items-center gap-1 text-sm font-bold">
              <Clock className="size-3.5 text-accent" /> {rdv.heure}
            </span>
            {rdv.lieu && (
              <span className="flex items-center gap-1 truncate text-xs text-ink-2">
                <MapPin className="size-3" /> {rdv.lieu}
              </span>
            )}
          </div>
          <p className="truncate text-xs capitalize text-ink-2">
            {formatDateFr(rdv.date)} · par {mien ? 'toi' : rdv.createur ?? '?'}
            {rdv.note ? ` · ${rdv.note}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {mien ? (
            <Button variant="ghost" size="icon" aria-label="Supprimer" onClick={() => onSupprimer(rdv.id)}>
              <Trash2 className="size-4 text-danger" />
            </Button>
          ) : dedans ? (
            <Button variant="ghost" size="icon" aria-label="Se désinscrire" onClick={() => onQuitter(rdv.id)}>
              <UserMinus className="size-4 text-warn" />
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => onRejoindre(rdv.id)}>
              <UserPlus className="size-4" /> Rejoindre
            </Button>
          )}
        </div>
      </div>
      {rdv.participants.length > 0 && (
        <div className="mt-1.5 flex items-center gap-1.5 pl-12">
          <Users className="size-3.5 shrink-0 text-ink-2" />
          <p className="truncate text-[11px] text-ink-2">{noms}</p>
          <Badge tone="accent">{rdv.participants.length}</Badge>
        </div>
      )}
    </div>
  );
}

interface RdvDialogProps {
  open: boolean;
  onClose: () => void;
  pending: boolean;
  onSubmit: (input: RdvInput) => Promise<unknown>;
  /** Date pré-remplie (ex. jour sélectionné dans le calendrier). */
  initialDate?: string;
}

/** « Je suis dispo » — publication d'un créneau visible par les autres clients. */
export function RdvDialog({ open, onClose, pending, onSubmit, initialDate }: RdvDialogProps) {
  const [date, setDate] = useState(todayInTimezone());
  const [heure, setHeure] = useState('18:00');
  const [lieu, setLieu] = useState('');
  const [note, setNote] = useState('');
  const [dateInvalide, setDateInvalide] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(initialDate ?? todayInTimezone());
    setDateInvalide(false);
    setHeure('18:00');
    setLieu('');
    setNote('');
  }, [open]);

  const submit = async () => {
    if (!date || !heure || date < todayInTimezone()) {
      toast.error(dateInvalide ? 'Date invalide' : 'Choisis une date à venir');
      return;
    }
    try {
      await onSubmit({ date, heure, lieu: lieu.trim() || null, note: note.trim() || null });
      toast.success('Dispo publiée — les autres clients la voient');
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Publication impossible');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="lg:max-w-lg">
        <DialogTitle className="flex items-center gap-2">
          <CalendarPlus className="size-5" /> Marquer ma dispo
        </DialogTitle>
        <DialogDescription>
          Ton créneau sera visible par tous les clients de ton coach — ceux qui veulent s'entraîner
          avec toi pourront le rejoindre.
        </DialogDescription>
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-2">Date (jj/mm/aaaa)</label>
              <DateInput value={date} onChange={setDate} invalid={setDateInvalide} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-2">Heure</label>
              <Input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-2">
              <MapPin className="mr-1 inline size-3" /> Salle (optionnel)
            </label>
            <Input value={lieu} onChange={(e) => setLieu(e.target.value)} placeholder="Nom de la salle…" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-2">Note (optionnel)</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Séance prévue, groupe musculaire…" />
          </div>
          <Button className="w-full" onClick={submit} loading={pending} disabled={!date}>
            Publier ma dispo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
