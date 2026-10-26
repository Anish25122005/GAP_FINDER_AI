import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', label, error, helperText, id, ...props }, ref) => {
    const generatedId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={generatedId} className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            {label}
          </label>
        )}
        <input
          id={generatedId}
          type={type}
          ref={ref}
          className={cn(
            'flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
            error && 'border-rose-500 focus:ring-rose-500',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        {!error && helperText && <p className="text-xs text-slate-500 dark:text-slate-400">{helperText}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

export function ProgressBar({ value, max = 100, className, color = 'bg-indigo-600' }: { value: number; max?: number; className?: string; color?: string }) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800', className)}>
      <div
        className={cn('h-full transition-all duration-300 ease-in-out', color)}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

export function Alert({ variant = 'info', title, children, className }: { variant?: 'info' | 'success' | 'warning' | 'danger'; title?: string; children: React.ReactNode; className?: string }) {
  const styles = {
    info: 'bg-indigo-50 border-indigo-200 text-indigo-900 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-200',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200',
    warning: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200',
    danger: 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200',
  };

  return (
    <div className={cn('rounded-lg border p-4 text-sm', styles[variant], className)} role="alert">
      {title && <h5 className="mb-1 font-semibold leading-none tracking-tight">{title}</h5>}
      <div className="text-sm opacity-90 leading-relaxed">{children}</div>
    </div>
  );
}
