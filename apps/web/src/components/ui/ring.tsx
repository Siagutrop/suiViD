import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

// ------------------------------------------------------------------
// Indicateur circulaire de progression (calories, macros…).
// ------------------------------------------------------------------

export function ProgressRing({
  value,
  max,
  size = 160,
  stroke = 12,
  label,
  sublabel,
  tone = 'accent',
  className,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  label: string;
  sublabel?: string;
  tone?: 'accent' | 'violet' | 'success' | 'warn' | 'danger';
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const colors = {
    accent: 'var(--accent)',
    violet: 'var(--violet)',
    success: 'var(--success)',
    warn: 'var(--warn)',
    danger: 'var(--danger)',
  };
  return (
    <div className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colors[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num-display text-3xl leading-none">{label}</span>
        {sublabel && <span className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-ink-2">{sublabel}</span>}
      </div>
    </div>
  );
}

/** Barre de progression fine pour les macros. */
export function MacroBar({
  label,
  value,
  max,
  unit = 'g',
  color,
}: {
  label: string;
  value: number | null;
  max: number | null;
  unit?: string;
  color: string;
}) {
  const pct = max && value != null ? Math.min((value / max) * 100, 100) : value != null && !max ? 100 : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-ink-2">{label}</span>
        <span className="num-display text-sm">
          {value ?? '—'}
          <span className="ml-1 text-[10px] font-semibold text-ink-2">/ {max ?? '—'} {unit}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line/70">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}
