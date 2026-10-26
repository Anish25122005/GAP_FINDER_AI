'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from './sidebar';
import { Navbar } from './navbar';
import type { Subject, UserProfile } from '@/lib/types';

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: UserProfile | null;
}) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);

  useEffect(() => {
    // Fetch user subjects for selector
    async function fetchSubjects() {
      try {
        const res = await fetch('/api/subjects');
        if (res.ok) {
          const data = await res.json();
          setSubjects(data.subjects || []);
          if (data.subjects && data.subjects.length > 0 && !selectedSubjectId) {
            setSelectedSubjectId(data.subjects[0].id);
          }
        }
      } catch {
        // ignore
      }
    }
    if (user) {
      fetchSubjects();
    }
  }, [user]);

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Desktop Sidebar */}
      <Sidebar className="hidden md:flex" />

      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMobileOpen(false)}
          />
          <div className="relative flex w-full max-w-xs flex-1 flex-col bg-white dark:bg-slate-900 shadow-xl">
            <Sidebar className="w-full flex-1" />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        <Navbar
          user={user}
          subjects={subjects}
          selectedSubjectId={selectedSubjectId}
          onSelectSubject={(id) => setSelectedSubjectId(id)}
          onToggleMobileMenu={() => setIsMobileOpen(!isMobileOpen)}
          isMobileMenuOpen={isMobileOpen}
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
