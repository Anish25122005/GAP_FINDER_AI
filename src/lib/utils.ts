import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { MasteryStatus, PlanItemPriority } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPercent(value: number, decimals: number = 0): string {
  if (isNaN(value)) return '0%';
  return `${value.toFixed(decimals)}%`;
}

export function formatDate(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

export function formatDateTime(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function getMasteryStatusLabel(status: MasteryStatus): string {
  switch (status) {
    case 'weak':
      return 'Weak (Needs Focus)';
    case 'medium':
      return 'Developing (Medium)';
    case 'strong':
      return 'Mastered (Strong)';
    case 'insufficient_evidence':
      return 'Untested / Insufficient Evidence';
    default:
      return status;
  }
}

export function getMasteryStatusBadgeStyles(status: MasteryStatus): {
  bg: string;
  text: string;
  border: string;
  badgeClass: string;
} {
  switch (status) {
    case 'strong':
      return {
        bg: 'bg-emerald-50 dark:bg-emerald-950/40',
        text: 'text-emerald-700 dark:text-emerald-300',
        border: 'border-emerald-200 dark:border-emerald-800',
        badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border-emerald-300',
      };
    case 'medium':
      return {
        bg: 'bg-amber-50 dark:bg-amber-950/40',
        text: 'text-amber-700 dark:text-amber-300',
        border: 'border-amber-200 dark:border-amber-800',
        badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 border-amber-300',
      };
    case 'weak':
      return {
        bg: 'bg-rose-50 dark:bg-rose-950/40',
        text: 'text-rose-700 dark:text-rose-300',
        border: 'border-rose-200 dark:border-rose-800',
        badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300 border-rose-300',
      };
    case 'insufficient_evidence':
    default:
      return {
        bg: 'bg-slate-50 dark:bg-slate-900/40',
        text: 'text-slate-600 dark:text-slate-400',
        border: 'border-slate-200 dark:border-slate-800',
        badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300',
      };
  }
}

export function getPriorityBadgeStyles(priority: PlanItemPriority): string {
  switch (priority) {
    case 'high':
      return 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300';
    case 'medium':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300';
    case 'low':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300';
    default:
      return 'bg-slate-100 text-slate-800';
  }
}
