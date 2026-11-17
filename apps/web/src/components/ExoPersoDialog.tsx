// Création / édition d'un exercice personnel : nom, groupe musculaire
// (suggestions existantes + texte libre), tag libre et vidéo optionnelle.

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Exercise } from '@suivi/shared';
import { useCreateExercice, useUpdateExercice, type ExoPersoInput } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

export function ExoPersoDialog({
  open,
  onOpenChange,
  muscles,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Groupes musculaires existants — suggestions du champ Muscle. */
  muscles: string[];
  /** Exercice à éditer (null/undefined = création). */
  initial?: Exercise | null;
  /** Appelé après un succès — ex. pour ajouter l'exo au programme. */
  onSaved?: (e: Exercise) => void;
}) {
  const [nom, setNom] = useState('');
  const [muscle, setMuscle] = useState('');
  const [tag, setTag] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const create = useCreateExercice();
  const update = useUpdateExercice();
  const pending = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    setNom(initial?.nom ?? '');
    setMuscle(initial?.muscle ?? '');
    setTag(initial?.tag ?? '');
    setVideoUrl(initial?.videoUrl ?? '');
  }, [open, initial]);

  const submit = async () => {
    const input: ExoPersoInput = {
      nom: nom.trim(),
      muscle: muscle.trim() || 'Autre',
      tag: tag.trim() || null,
      videoUrl: videoUrl.trim() || null,
    };
    if (!input.nom) {
      toast.error('Donne un nom à ton exercice');
      return;
    }
    try {
      const saved = initial
        ? await update.mutateAsync({ originalNom: initial.nom, ...input })
        : await create.mutateAsync(input);
      toast.success(initial ? 'Exercice mis à jour' : 'Exercice créé');
      onOpenChange(false);
      onSaved?.(saved);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Enregistrement impossible');
    }
  };

  const label = 'mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-2';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="lg:max-w-lg">
        <DialogTitle>{initial ? "Modifier l'exercice" : 'Nouvel exercice perso'}</DialogTitle>
        <DialogDescription>
          Il rejoint ta bibliothèque et devient sélectionnable dans tes programmes.
        </DialogDescription>
        <div className="mt-4 space-y-3">
          <div>
            <label className={label}>Nom</label>
            <Input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Ex. Rowing haltères unilatéral"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Groupe musculaire</label>
              <Input
                list="exo-muscles"
                value={muscle}
                onChange={(e) => setMuscle(e.target.value)}
                placeholder="Dos, Biceps, Jambes…"
              />
              <datalist id="exo-muscles">
                {muscles.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={label}>Tag perso (optionnel)</label>
              <Input
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="maison, élastique…"
              />
            </div>
          </div>
          <div>
            <label className={label}>Lien vidéo (optionnel)</label>
            <Input
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://youtube.com/…"
            />
          </div>
          <Button className="w-full" onClick={submit} loading={pending} disabled={!nom.trim()}>
            {initial ? 'Enregistrer' : "Créer l'exercice"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
