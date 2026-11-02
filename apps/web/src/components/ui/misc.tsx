import { cn } from '@/lib/utils';

/** Skeleton de chargement. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-line/60', className)} />;
}

/** Badge compact. */
export function Badge({
  className,
  tone = 'default',
  children,
}: {
  className?: string;
  tone?: 'default' | 'accent' | 'violet' | 'success' | 'warn' | 'danger';
  children: React.ReactNode;
}) {
  const tones = {
    default: 'bg-line/50 text-ink-2',
    accent: 'bg-accent-soft text-accent',
    violet: 'bg-violet-soft text-violet',
    success: 'bg-success/15 text-success',
    warn: 'bg-warn/15 text-warn',
    danger: 'bg-danger/15 text-danger',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold', tones[tone], className)}>
      {children}
    </span>
  );
}

/** État vide soigné. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line bg-bg-2/50 px-6 py-12 text-center', className)}>
      {icon && <div className="flex size-14 items-center justify-center rounded-2xl bg-line/40 text-ink-2">{icon}</div>}
      <div>
        <p className="font-bold text-ink">{title}</p>
        {description && <p className="mt-1 max-w-xs text-sm text-ink-2">{description}</p>}
      </div>
      {action}
    </div>
  );
}
