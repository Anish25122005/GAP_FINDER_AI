'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User, LogOut, Menu, X, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Subject, UserProfile } from '@/lib/types';

export function Navbar({
  user,
  subjects = [],
  selectedSubjectId,
  onSelectSubject,
  onToggleMobileMenu,
  isMobileMenuOpen,
}: {
  user?: UserProfile | null;
  subjects?: Subject[];
  selectedSubjectId?: string | null;
  onSelectSubject?: (id: string) => void;
  onToggleMobileMenu?: () => void;
  isMobileMenuOpen?: boolean;
}) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch {
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-4 sm:px-6 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      <div className="flex items-center gap-3">
        {onToggleMobileMenu && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleMobileMenu}
            className="md:hidden"
            aria-label="Toggle Navigation"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        )}

        {/* Subject Selector */}
        {subjects.length > 0 && onSelectSubject && (
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-slate-400 hidden sm:block" />
            <select
              value={selectedSubjectId || ''}
              onChange={(e) => onSelectSubject(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs sm:text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code ? `[${s.code}] ` : ''}
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* User Actions */}
      <div className="flex items-center gap-3">
        {user ? (
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {user.fullName || user.email}
              </span>
              <span className="text-[10px] text-slate-500">{user.email}</span>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 font-semibold text-xs border border-indigo-200">
              <User className="h-4 w-4" />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              isLoading={isLoggingOut}
              className="text-xs"
              title="Sign Out"
            >
              <LogOut className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/login')}>
              Sign In
            </Button>
            <Button variant="primary" size="sm" onClick={() => router.push('/register')}>
              Get Started
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
