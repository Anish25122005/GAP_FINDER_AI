'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  HelpCircle,
  TrendingDown,
  CalendarCheck,
  BotMessageSquare,
  BarChart3,
  Settings,
  GraduationCap,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const NAVIGATION_ITEMS = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Subjects & Syllabus', href: '/subjects', icon: BookOpen },
  { name: 'Document Library', href: '/documents', icon: FileText },
  { name: 'Diagnostic Quiz', href: '/quiz/new', icon: HelpCircle },
  { name: 'Knowledge Gap Report', href: '/gap-report', icon: TrendingDown },
  { name: 'Personalized Plan', href: '/revision-plan', icon: CalendarCheck },
  { name: 'Topic Assistant', href: '/assistant', icon: BotMessageSquare },
  { name: 'Progress & Trends', href: '/progress', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'w-64 flex-col border-r border-slate-200 bg-white flex shrink-0 dark:border-slate-800 dark:bg-slate-900',
        className
      )}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center gap-2.5 px-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
          <GraduationCap className="h-5 w-5" />
        </div>
        <div>
          <span className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            GapFinder <span className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 px-1.5 py-0.5 rounded font-mono">AI</span>
          </span>
          <span className="text-[10px] text-slate-500 font-medium block">Defensible Diagnostic Mastery</span>
        </div>
      </div>

      {/* Nav List */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {NAVIGATION_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-indigo-50 text-indigo-700 font-semibold dark:bg-indigo-950/60 dark:text-indigo-300'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
              )}
            >
              <Icon className={cn('h-4 w-4', isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400')} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </div>

      {/* Footer Info Box */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800">
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/60">
          <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200 mb-1">
            <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
            <span>Strict Evidence Guarantee</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            Diagnoses are derived exclusively from verified quiz attempts & source notes.
          </p>
        </div>
      </div>
    </aside>
  );
}
