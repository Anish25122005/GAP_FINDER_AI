import React from 'react';
import { cn } from '@/lib/utils';
import type { MasteryStatus } from '@/lib/types';
import { getMasteryStatusBadgeStyles, getMasteryStatusLabel } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline';
}

export function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  const variants = {
    default: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-200',
    success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300',
    warning: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300',
    danger: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300',
    info: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-300',
    outline: 'border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-transparent',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function MasteryBadge({ status, showScore, score }: { status: MasteryStatus; showScore?: boolean; score?: number }) {
  const styles = getMasteryStatusBadgeStyles(status);
  const label = getMasteryStatusLabel(status);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        styles.badgeClass
      )}
    >
      <span className={cn('w-2 h-2 rounded-full', {
        'bg-emerald-500': status === 'strong',
        'bg-amber-500': status === 'medium',
        'bg-rose-500': status === 'weak',
        'bg-slate-400': status === 'insufficient_evidence',
      })} />
      <span>{label}</span>
      {showScore && typeof score === 'number' && status !== 'insufficient_evidence' && (
        <span className="font-bold opacity-90">({score.toFixed(0)}%)</span>
      )}
    </span>
  );
}
