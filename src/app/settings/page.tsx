'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Settings,
  User,
  Shield,
  Cpu,
  Database,
  Sparkles,
  LogOut,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { UserProfile } from '@/lib/types';

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const userRes = await fetch('/api/auth/me');
        if (!userRes.ok) {
          router.push('/login');
          return;
        }
        const u = await userRes.json();
        setUser(u.user);
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, [router]);

  const handleSeedDemo = async () => {
    setIsSeeding(true);
    setSeedMessage(null);
    try {
      const res = await fetch('/api/auth/demo', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSeedMessage('Successfully loaded sample course CS 401 and vector chunks!');
      } else {
        setSeedMessage(`Error: ${data.error}`);
      }
    } catch (err: any) {
      setSeedMessage(`Error: ${err.message}`);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <AppShell user={user}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Account & System Settings
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Review your profile, AI provider connection status, and database configuration.
          </p>
        </div>

        {/* User Profile Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-600" />
              <span>Student Profile</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-xs font-semibold text-slate-500 block mb-1">Full Name</span>
                <p className="font-medium text-sm text-slate-800 dark:text-slate-200">
                  {user?.fullName || 'Student'}
                </p>
              </div>

              <div>
                <span className="text-xs font-semibold text-slate-500 block mb-1">Email Address</span>
                <p className="font-mono text-sm text-slate-800 dark:text-slate-200">
                  {user?.email}
                </p>
              </div>
            </div>

            <div className="pt-2">
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="w-3.5 h-3.5 mr-1.5" />
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* System & Architecture Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-600" />
              <span>AI Provider & Vector Architecture</span>
            </CardTitle>
            <CardDescription>
              Current runtime configuration and vector search engine.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 text-xs">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200 block">AI Provider Engine</span>
                <span className="text-slate-500">Supports OpenAI (gpt-4o-mini), Google Gemini, and Local Deterministic</span>
              </div>
              <Badge variant="success">Active</Badge>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 text-xs">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200 block">Vector Embedding Space</span>
                <span className="text-slate-500">1536-dimensional normalized cosine similarity store</span>
              </div>
              <Badge variant="info">pgvector Compatible</Badge>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 text-xs">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200 block">Database Isolation</span>
                <span className="text-slate-500">Row Level Security (RLS) + strict user-scoped queries</span>
              </div>
              <Badge variant="success">Enforced</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Demonstration & Course Seeding */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Sample Demonstration Dataset</span>
            </CardTitle>
            <CardDescription>
              Re-seed the verified sample course: CS 401 Distributed Systems & Cloud Computing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Loads an original, comprehensive academic dataset with 3 units, 6 topics, full study notes, and pre-computed vector chunks for testing the end-to-end workflow.
            </p>

            {seedMessage && (
              <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-indigo-900">
                {seedMessage}
              </div>
            )}

            <Button variant="primary" size="sm" onClick={handleSeedDemo} isLoading={isSeeding}>
              <Sparkles className="w-4 h-4 mr-1.5" />
              Seed Sample Course (CS 401)
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
