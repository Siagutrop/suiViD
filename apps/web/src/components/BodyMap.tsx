// Carte musculaire détaillée — wrapper React autour de MuscleMapJS
// (code tiers MIT, voir src/vendor/musclemap/LICENSE).
// Deux modèles anatomiques Canvas (face avant / dos), muscles actifs en accent.
// Mode heat map : `intensities` (0–1) gradue l'opacité de chaque muscle.
// Les couleurs sont résolues depuis les variables du thème courant.

import { useEffect, useRef } from 'react';
import {
  MuscleMapWidget,
  type BodyGender,
  type BodySide,
  type BodyViewStyle,
  type Muscle,
} from '@/vendor/musclemap/index';
import type { BuildId } from '@/lib/body';

/** Label de l'onglet Liste -> ids MuscleMapJS (groupes + sous-groupes). */
export const MUSCLE_TO_ZONES: Record<string, Muscle[]> = {
  Pectoraux: ['chest', 'upper-chest', 'lower-chest'],
  Dos: ['upper-back', 'trapezius', 'rhomboids', 'upper-trapezius', 'lower-trapezius'],
  Epaules: ['deltoids', 'front-deltoid', 'rear-deltoid', 'upper-trapezius'],
  Biceps: ['biceps', 'forearm'],
  Triceps: ['triceps'],
  Trices: ['triceps'], // coquille de l'onglet source
  Abdos: ['abs', 'upper-abs', 'lower-abs', 'obliques'],
  Quadriceps: ['quadriceps', 'inner-quad', 'outer-quad'],
  Adducteur: ['adductors'],
  Fessiers: ['gluteal'],
  Ischios: ['hamstring'],
  Lombaires: ['lower-back'],
  Mollets: ['calves'],
};

/** Résout une variable CSS --xxx en couleur rgb/rgba utilisable sur canvas. */
function cssColor(name: string, alpha?: number): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#9099AA';
  if (alpha == null) return raw;
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(raw);
  if (!m) return raw;
  const [r, g, b] = [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Style du widget dérivé du thème : silhouette en --ink, sélection en --accent. */
function themeStyle(): BodyViewStyle {
  const inkFill = cssColor('--ink', 0.14);
  const inkStroke = cssColor('--ink', 0.3);
  const accent = cssColor('--accent');
  return {
    defaultFillColor: inkFill,
    strokeColor: inkStroke,
    strokeWidth: 1.2,
    selectionColor: accent,
    selectionStrokeColor: accent,
    selectionStrokeWidth: 2,
    headColor: inkFill,
    hairColor: cssColor('--ink', 0.35),
    shadowColor: 'transparent',
    shadowRadius: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  };
}

/** Zones -> couleur : accent plein (fiche) ou échelle chaude (heat map 0–1). */
export interface MapInput {
  /** Labels Liste à illuminer pleinement (fiche exercice). */
  muscles?: string[];
  /** Intensité 0–1 par label Liste (heat map de sollicitation). */
  intensities?: Record<string, number>;
}

/** Rampe thermique du thème : violet (peu) → accent → orange → rouge (beaucoup). */
const HEAT_STOPS = ['--violet', '--accent', '--warn', '--danger'] as const;

function heatColor(t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  const stops = HEAT_STOPS.map((v) => cssColor(v));
  const pos = clamped * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(pos));
  const f = pos - i;
  const rgb = (hex: string) => {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
    return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : [144, 153, 170];
  };
  const [a, b] = [rgb(stops[i]!), rgb(stops[i + 1]!)];
  const mix = a.map((v, k) => Math.round(v + (b[k]! - v) * f));
  return `rgb(${mix[0]},${mix[1]},${mix[2]})`;
}

function resolveHighlights(input: MapInput): Array<{ muscle: Muscle; color: string; opacity: number }> {
  const accent = cssColor('--accent');
  const out = new Map<Muscle, { color: string; intensity: number }>();
  for (const m of input.muscles ?? []) {
    for (const z of MUSCLE_TO_ZONES[m] ?? []) out.set(z, { color: accent, intensity: 1 });
  }
  for (const [label, i] of Object.entries(input.intensities ?? {})) {
    const t = Math.min(1, Math.max(0, i));
    for (const z of MUSCLE_TO_ZONES[label] ?? []) {
      const cur = out.get(z);
      if (!cur || t > cur.intensity) out.set(z, { color: heatColor(t), intensity: t });
    }
  }
  return [...out.entries()].map(([muscle, v]) => ({ muscle, color: v.color, opacity: 0.35 + 0.65 * v.intensity }));
}

function Figure({ side, gender, input }: { side: BodySide; gender: BodyGender; input: MapInput }) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<MuscleMapWidget | null>(null);
  const inputRef = useRef(input);

  const paint = () => {
    const w = widgetRef.current;
    if (!w) return;
    w.setStyle(themeStyle());
    w.clearHighlights();
    for (const h of resolveHighlights(inputRef.current)) {
      w.highlight(h.muscle, h.color, h.opacity);
    }
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const widget = new MuscleMapWidget(el, {
      side,
      gender,
      style: themeStyle(),
      interactive: false,
      multiSelect: false,
      showSubGroups: true,
      locale: 'fr',
    });
    widgetRef.current = widget;
    paint();
    // Repeindre quand le thème change (data-theme sur <html>)
    const mo = new MutationObserver((muts) => {
      if (muts.some((m) => m.attributeName === 'data-theme')) paint();
    });
    mo.observe(document.documentElement, { attributes: true });
    return () => {
      mo.disconnect();
      widget.destroy();
      widgetRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, gender]);

  // Mise à jour des muscles/intensités sans recréer le widget
  useEffect(() => {
    inputRef.current = input;
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  return <div ref={ref} className="h-full w-full" />;
}

export function BodyMap({
  muscles,
  intensities,
  build = 'male',
  height = 240,
  labels = false,
}: {
  muscles?: string[];
  intensities?: Record<string, number>;
  build?: BuildId;
  height?: number;
  labels?: boolean;
}) {
  const input: MapInput = { muscles, intensities };
  const figH = labels ? height - 18 : height;
  const figure = (side: BodySide, label: string) => (
    <div className="flex flex-col items-center gap-1">
      <div style={{ height: figH, aspectRatio: '0.57' }}>
        <Figure side={side} gender={build} input={input} />
      </div>
      {labels && <span className="text-[10px] font-bold uppercase tracking-wider text-ink-2">{label}</span>}
    </div>
  );
  return (
    <div className="flex items-start justify-center gap-5">
      {figure('front', 'Avant')}
      {figure('back', 'Dos')}
    </div>
  );
}
