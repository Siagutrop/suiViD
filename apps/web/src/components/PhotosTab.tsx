// Suivi photo de progression — onglet de la page Progrès.
// - Grille par angle (face / profil / dos)
// - Comparateur avant↔après à curseur draggable
// - Capture assistée : la photo précédente du même angle s'affiche en
//   fantôme sur le flux caméra pour reproduire la pose au plus près.

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Camera, CameraOff, ImagePlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Photo } from '@suivi/shared';
import { todayInTimezone } from '@suivi/shared';
import { useDeletePhoto, usePhotos, useUploadPhoto } from '@/hooks/queries';
import { getToken } from '@/lib/api';
import { cn, formatDateFr } from '@/lib/utils';
import { PhotoCompareDialog } from '@/components/PhotoCompareDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/misc';

const ANGLE_LABELS: Record<string, string> = {
  face: 'Face',
  'profil-droit': 'Profil droit',
  'profil-gauche': 'Profil gauche',
  profil: 'Profil',
  dos: 'Dos',
};
const POSE_LABELS: Record<string, string> = { relache: 'relâché', contracte: 'contracté' };

/** Clé de groupe/ghost : angle + pose (les anciennes photos sans pose comptent relâchées). */
const photoKey = (p: { angle: string; pose?: string }) => `${p.angle}|${p.pose ?? 'relache'}`;
const keyLabel = (key: string) => {
  const [angle, pose] = key.split('|');
  const a = ANGLE_LABELS[angle!] ?? angle!;
  return pose ? `${a} — ${POSE_LABELS[pose] ?? pose}` : a;
};
const GROUP_ORDER = ['face', 'profil-droit', 'profil-gauche', 'dos', 'profil'].flatMap((a) => [
  `${a}|relache`,
  `${a}|contracte`,
]);

// ---------- Chargement des fichiers (auth Bearer → objectURL) ----------
const urlCache = new Map<string, Promise<string>>();

function photoUrl(id: string, base = '/api/photos'): Promise<string> {
  const key = `${base}/${id}`;
  let p = urlCache.get(key);
  if (!p) {
    p = fetch(`${base}/${id}/file`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('photo'))))
      .then((b) => URL.createObjectURL(b));
    urlCache.set(key, p);
    p.catch(() => urlCache.delete(key));
  }
  return p;
}

export function PhotoImg({ id, base, className, alt, style }: { id: string; base?: string; className?: string; alt: string; style?: React.CSSProperties }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    void photoUrl(id, base).then((u) => on && setSrc(u)).catch(() => undefined);
    return () => {
      on = false;
    };
  }, [id, base]);
  if (!src) return <div className={cn('animate-pulse bg-line/40', className)} style={style} />;
  return <img src={src} alt={alt} className={className} style={style} draggable={false} />;
}

// ---------- Onglet ----------

export function PhotosTab() {
  const { data: photos, isLoading } = usePhotos();
  const del = useDeletePhoto();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [compare, setCompare] = useState<{ avant: Photo; apres: Photo } | null>(null);
  const [selecting, setSelecting] = useState<Photo | null>(null); // 1er choix pour comparer

  const byKey = useMemo(() => {
    const m = new Map<string, Photo[]>();
    for (const p of photos ?? []) {
      const k = photoKey(p);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return m;
  }, [photos]);

  const groupKeys = useMemo(() => {
    const known = GROUP_ORDER.filter((k) => byKey.has(k));
    const extra = [...byKey.keys()].filter((k) => !GROUP_ORDER.includes(k));
    return [...known, ...extra];
  }, [byKey]);

  const lastByKey = useMemo(() => {
    const m = new Map<string, Photo>();
    for (const p of photos ?? []) {
      const k = photoKey(p);
      if (!m.has(k)) m.set(k, p); // liste déjà triée desc
    }
    return m;
  }, [photos]);

  // Bilan périodique : dernière photo de plus de 28 j → rappel en évidence.
  const today = todayInTimezone();
  const joursDepuis = photos?.[0]?.date
    ? Math.round((Date.parse(today) - Date.parse(photos[0].date)) / 86_400_000)
    : null;

  const pick = (p: Photo) => {
    if (!selecting) {
      setSelecting(p);
      toast.info('Choisis maintenant la deuxième photo à comparer');
      return;
    }
    if (selecting.id === p.id) {
      setSelecting(null);
      return;
    }
    const [a, b] = [selecting, p].sort((x, y) => x.date.localeCompare(y.date));
    setCompare({ avant: a!, apres: b! });
    setSelecting(null);
  };

  return (
    <div className="space-y-4">
      {joursDepuis != null && joursDepuis >= 28 && (
        <Card className="relative overflow-hidden border-accent/40">
          <div className="halo halo-slow pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-accent/20 blur-3xl" />
          <CardContent className="flex items-center gap-4 py-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent">
              <Camera className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Bilan photo à faire</p>
              <p className="text-xs text-ink-2">
                {joursDepuis} jours depuis la dernière série — la séquence guidée te remet dans la même position.
              </p>
            </div>
            <Button size="sm" onClick={() => setCaptureOpen(true)}>
              <Camera className="size-4" /> Lancer
            </Button>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Photos de progression</CardTitle>
          <Button size="sm" onClick={() => setCaptureOpen(true)}>
            <Camera className="size-4" /> Ajouter
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading && <div className="grid grid-cols-3 gap-3">{[0, 1, 2].map((i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-line/40" />)}</div>}
          {!isLoading && !photos?.length && (
            <EmptyState
              icon={<Camera className="size-6" />}
              title="Aucune photo"
              description="Prends ta première photo — la capture assistée t'aide à reproduire la même pose à chaque fois."
              action={<Button onClick={() => setCaptureOpen(true)}><Camera className="size-4" /> Prendre une photo</Button>}
            />
          )}
          {groupKeys.map((key) => {
            const list = byKey.get(key) ?? [];
            return (
              <div key={key} className="mb-4 last:mb-0">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-2">{keyLabel(key)} · {list.length}</p>
                <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                  {list.map((p) => (
                    <motion.button
                      key={p.id}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => pick(p)}
                      className={cn(
                        'group relative aspect-[3/4] overflow-hidden rounded-2xl border-2 text-left',
                        selecting?.id === p.id ? 'border-accent' : 'border-transparent',
                      )}
                    >
                      <PhotoImg id={p.id} alt={`${keyLabel(key)} du ${p.date}`} className="size-full object-cover" />
                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg/90 to-transparent px-2 pb-1.5 pt-6 text-[10px] font-bold">
                        {formatDateFr(p.date)}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </div>
            );
          })}
          {photos && photos.length > 1 && (
            <p className="mt-1 text-[11px] text-ink-2">
              Touche deux photos pour les comparer côte à côte.
            </p>
          )}
        </CardContent>
      </Card>

      <CaptureDialog
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        ghosts={lastByKey}
      />

      {compare && (
        <PhotoCompareDialog
          compare={compare}
          onClose={() => setCompare(null)}
          onDelete={(p, done) => del.mutate(p.id, { onSuccess: done })}
        />
      )}
    </div>
  );
}

// ---------- Capture guidée : Face → Profil D → Profil G → Dos, relâché + contracté ----------

const SEQUENCE = [
  { angle: 'face', pose: 'relache', titre: 'Face — relâché', consigne: 'Debout face à l’objectif, corps entier, bras le long du corps, muscles décontractés.' },
  { angle: 'face', pose: 'contracte', titre: 'Face — contracté', consigne: 'Même position de face, muscles contractés — serre les poings.' },
  { angle: 'profil-droit', pose: 'relache', titre: 'Profil droit — relâché', consigne: 'De profil, épaule droite vers l’objectif, bras le long du corps.' },
  { angle: 'profil-droit', pose: 'contracte', titre: 'Profil droit — contracté', consigne: 'Même profil droit, abdominaux serrés.' },
  { angle: 'profil-gauche', pose: 'relache', titre: 'Profil gauche — relâché', consigne: 'De profil, épaule gauche vers l’objectif, bras le long du corps.' },
  { angle: 'profil-gauche', pose: 'contracte', titre: 'Profil gauche — contracté', consigne: 'Même profil gauche, abdominaux serrés.' },
  { angle: 'dos', pose: 'relache', titre: 'Dos — relâché', consigne: 'De dos, bras le long du corps, muscles décontractés.' },
  { angle: 'dos', pose: 'contracte', titre: 'Dos — contracté', consigne: 'Double biceps de dos, comme sur le bilan du coach.' },
] as const;

interface Shot {
  angle: string;
  pose: string;
  image: string;
}

function CaptureDialog({
  open,
  onClose,
  ghosts,
}: {
  open: boolean;
  onClose: () => void;
  ghosts: Map<string, Photo>;
}) {
  const upload = useUploadPhoto();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [camError, setCamError] = useState(false);
  const [ghostOn, setGhostOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null); // photo prise, à confirmer
  const [fileMode, setFileMode] = useState(false);
  const done = useRef(0);

  const current = SEQUENCE[step]!;
  const ghost = ghosts.get(`${current.angle}|${current.pose}`) ?? null;
  const isLast = step === SEQUENCE.length - 1;

  // Flux caméra (l'utilisateur peut refuser → repli fichier)
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setPreview(null);
    setFileMode(false);
    setCamError(false);
    done.current = 0;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setCamError(true));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open]);

  const send = (shot: Shot, advance: boolean) => {
    setBusy(true);
    upload.mutate(
      { angle: shot.angle, pose: shot.pose, date: todayInTimezone(), image: shot.image },
      {
        onSuccess: () => {
          done.current++;
          setBusy(false);
          setPreview(null);
          if (advance && !isLast) setStep((s) => s + 1);
          else if (isLast) {
            toast.success(`${done.current} photo${done.current > 1 ? 's' : ''} enregistrée${done.current > 1 ? 's' : ''}`);
            onClose();
          }
        },
        onError: () => {
          toast.error('Envoi impossible — réessaie');
          setBusy(false);
        },
      },
    );
  };

  const shoot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const scale = Math.min(1, 1280 / video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1); // miroir comme l'aperçu
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setPreview(canvas.toDataURL('image/jpeg', 0.85));
  };

  const pickFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1280 / img.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        send({ angle: current.angle, pose: current.pose, image: canvas.toDataURL('image/jpeg', 0.85) }, true);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(f);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] p-0">
        <div className="px-6 pt-6">
          <DialogTitle>
            Photo {step + 1}/{SEQUENCE.length} — {current.titre}
          </DialogTitle>
          {/* Progression de la séquence */}
          <div className="mt-3 flex gap-1.5">
            {SEQUENCE.map((s, i) => (
              <div
                key={`${s.angle}-${i}`}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors',
                  i < step ? 'bg-success' : i === step ? 'bg-accent' : 'bg-line',
                )}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-2">{current.consigne}</p>
        </div>

        <div className="p-6 pt-4">
          {camError || fileMode ? (
            <div className="space-y-3">
              <button
                onClick={() => fileRef.current?.click()}
                className="flex aspect-[3/4] max-h-[55dvh] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-bg-2 text-ink-2 transition-colors hover:border-accent"
              >
                {camError ? <CameraOff className="size-8" /> : <ImagePlus className="size-8" />}
                <p className="px-6 text-center text-sm">
                  {camError ? 'Caméra indisponible — ' : ''}Importer la photo « {current.titre} »
                </p>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) pickFile(e.target.files[0]);
                  e.target.value = '';
                }}
              />
              <div className="flex gap-2">
                {!isLast && (
                  <Button variant="secondary" className="flex-1" onClick={() => setStep((s) => s + 1)}>
                    Passer
                  </Button>
                )}
                {isLast && done.current === 0 ? (
                  <Button variant="secondary" className="flex-1" onClick={onClose}>
                    Terminer sans photo
                  </Button>
                ) : null}
              </div>
            </div>
          ) : preview ? (
            /* Aperçu avant confirmation */
            <div className="space-y-3">
              <div className="relative aspect-[3/4] max-h-[55dvh] w-full overflow-hidden rounded-2xl bg-black">
                <img src={preview} alt="Aperçu" className="size-full object-cover" />
                <span className="absolute left-2 top-2 rounded-full bg-bg/70 px-2.5 py-1 text-[10px] font-bold backdrop-blur">
                  {current.titre}
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setPreview(null)} disabled={busy}>
                  Reprendre
                </Button>
                <Button className="flex-1" onClick={() => send({ angle: current.angle, pose: current.pose, image: preview }, true)} disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  {isLast ? 'Terminer' : 'Suivant'}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="relative aspect-[3/4] max-h-[55dvh] w-full overflow-hidden rounded-2xl bg-black">
                {/* Flux caméra (miroir comme un selfie) */}
                <video ref={videoRef} autoPlay playsInline muted className="size-full -scale-x-100 object-cover" />
                {/* Fantôme : dernière photo du même angle pour aligner la pose */}
                {ghostOn && ghost && (
                  <PhotoImg
                    id={ghost.id}
                    alt="Repère"
                    className="pointer-events-none absolute inset-0 size-full object-cover opacity-40 mix-blend-luminosity"
                  />
                )}
                {/* Repères de cadrage */}
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-ink/15" />
                  <div className="absolute left-0 top-1/3 h-px w-full bg-ink/15" />
                </div>
                {ghost && (
                  <button
                    onClick={() => setGhostOn((v) => !v)}
                    className="absolute right-2 top-2 rounded-full bg-bg/70 px-2.5 py-1 text-[10px] font-bold text-ink backdrop-blur"
                  >
                    Repère {ghostOn ? 'activé' : 'masqué'}
                  </button>
                )}
              </div>
              <p className="mt-2 text-center text-[11px] text-ink-2">
                {ghost
                  ? 'Aligne-toi sur le repère translucide — même position, même cadrage.'
                  : 'Cadre-toi — cette photo servira de repère pour la prochaine fois.'}
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setFileMode(true)}>
                  <ImagePlus className="size-4" /> Fichier
                </Button>
                <Button className="flex-1" size="lg" onClick={shoot} disabled={busy}>
                  {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
                  Prendre
                </Button>
                {!isLast && (
                  <Button variant="ghost" size="sm" onClick={() => setStep((s) => s + 1)}>
                    Passer
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
