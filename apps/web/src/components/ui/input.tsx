import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  suffix?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, suffix, ...props }, ref) => (
    <div className="relative">
      <input
        ref={ref}
        className={cn(
          'flex h-12 w-full rounded-xl border border-line bg-bg-2 px-4 text-base font-semibold text-ink',
          'placeholder:font-normal placeholder:text-ink-2/50 transition-colors',
          'focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20',
          'disabled:cursor-not-allowed disabled:opacity-50',
          suffix && 'pr-14',
          className,
        )}
        {...props}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-medium text-ink-2">
          {suffix}
        </span>
      )}
    </div>
  ),
);
Input.displayName = 'Input';
