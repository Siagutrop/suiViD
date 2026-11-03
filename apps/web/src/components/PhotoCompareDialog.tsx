// Comparateur avant / après à curseur draggable — partagé entre
// l'onglet Photos du client et la fiche client du coach (`base`
// pointe alors vers les routes admin).

import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Photo } from '@suivi/shared';
import { formatDateFr } from '@/lib/utils';
import { PhotoImg } from '@/components/PhotosTab';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export function PhotoCompareDialog({
  compare,
  onClose,
  base,
  onDelete,
}: {
  compare: { avant: Photo; apres: Photo };
  onClose: () => void;
  /** Préfixe d'URL des fichiers — défaut /api/photos (client). */
  base?: string;
  /** Suppression optionnelle (le coach passe sa mutation admin). */
  onDelete?: (photo: Photo, done: () => void) => void;
}) {
  const [pos, setPos] = useState(50);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [confirmDel, setConfirmDel] = useState<Photo | null>(null);

  const move = (clientX: number) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.min(97, Math.max(3, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] p-0">
        <div className="flex items-center justify-between px-6 pt-6">
          <DialogTitle>Comparaison</DialogTitle>
          {onDelete && (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmDel(compare.avant)}>
                <Trash2 className="size-4 text-danger" /> Avant
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDel(compare.apres)}>
                <Trash2 className="size-4 text-danger" /> Après
              </Button>
            </div>
          )}
        </div>
        <div className="p-6 pt-4">
          <div
            ref={boxRef}
            className="relative aspect-[3/4] max-h-[60dvh] w-full select-none overflow-hidden rounded-2xl bg-black"
            onPointerDown={(e) => {
              dragging.current = true;
              move(e.clientX);
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={(e) => dragging.current && move(e.clientX)}
            onPointerUp={() => (dragging.current = false)}
          >
            {/* Après en dessous ; avant par-dessus rogné à gauche (clip-path, pas de déformation) */}
            <PhotoImg id={compare.apres.id} base={base} alt="Après" className="absolute inset-0 size-full object-cover" />
            <PhotoImg
              id={compare.avant.id}
              base={base}
              alt="Avant"
              className="absolute inset-0 size-full object-cover"
              style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
            />
            {/* Curseur */}
            <div className="absolute inset-y-0 w-0.5 bg-ink/90" style={{ left: `${pos}%` }}>
              <div className="absolute left-1/2 top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-bg/90 backdrop-blur">
                <ChevronLeft className="size-3.5" />
                <ChevronRight className="size-3.5" />
              </div>
            </div>
            <span className="absolute left-2 top-2 rounded-full bg-bg/70 px-2 py-0.5 text-[10px] font-bold backdrop-blur">
              {formatDateFr(compare.avant.date)}
            </span>
            <span className="absolute right-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-on-accent">
              {formatDateFr(compare.apres.date)}
            </span>
          </div>
          <p className="mt-2 text-center text-[11px] text-ink-2">Glisse le curseur pour comparer avant / après.</p>
        </div>

        {confirmDel && onDelete && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-bg/80 p-6 backdrop-blur-sm">
            <div className="text-center">
              <p className="mb-4 text-sm font-bold">Supprimer cette photo ?</p>
              <div className="flex justify-center gap-2">
                <Button variant="secondary" onClick={() => setConfirmDel(null)}><X className="size-4" /> Annuler</Button>
                <Button
                  variant="danger"
                  onClick={() =>
                    onDelete(confirmDel, () => {
                      toast.success('Photo supprimée');
                      setConfirmDel(null);
                      onClose();
                    })
                  }
                >
                  <Trash2 className="size-4" /> Supprimer
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
