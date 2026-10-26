'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  GraduationCap,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  BookOpen,
  Target,
  CalendarCheck,
  TrendingDown,
  Layers,
  FileCheck2,
  User,
  LayoutDashboard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { UserProfile } from '@/lib/types';

export default function LandingPage() {
  const router = useRouter();
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setCurrentUser(data.user);
        }
      })
      .catch(() => {})
      .finally(() => setIsAuthChecking(false));
  }, []);

  const handleLaunchDemo = async () => {
    setIsDemoLoading(true);
    try {
      const res = await fetch('/api/auth/demo', { method: 'POST' });
      if (res.ok) {
        router.push('/dashboard');
        router.refresh();
      } else {
        alert('Could not launch demo account. Please try registering or signing in.');
        setIsDemoLoading(false);
      }
    } catch {
      setIsDemoLoading(false);
    }
  };

  const handleExitDemo = async () => {
    setIsDemoLoading(true);
    try {
      await fetch('/api/auth/demo', { method: 'DELETE' });
      router.push('/dashboard');
      router.refresh();
    } catch {
      setIsDemoLoading(false);
    }
  };

  const isDemoActive = currentUser?.email === 'demo.student@gapfinder.ai';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-200/80 bg-white/90 dark:border-slate-800/80 dark:bg-slate-900/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
              <GraduationCap className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              GapFinder <span className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 px-1.5 py-0.5 rounded font-mono">AI</span>
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {!isAuthChecking && currentUser ? (
              // Authenticated user controls
              <>
                {isDemoActive ? (
                  <>
                    <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                      Demo Mode
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExitDemo}
                      isLoading={isDemoLoading}
                      className="border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-200"
                    >
                      Exit Demo
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLaunchDemo}
                    isLoading={isDemoLoading}
                    className="border-indigo-200 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100 dark:border-indigo-800 dark:text-indigo-300 dark:bg-indigo-950/40"
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1 text-indigo-600" />
                    Demo Mode (CS 401)
                  </Button>
                )}
                <Link href="/dashboard">
                  <Button variant="primary" size="sm" className="font-semibold shadow-sm">
                    <LayoutDashboard className="w-3.5 h-3.5 mr-1.5" />
                    Dashboard
                  </Button>
                </Link>
              </>
            ) : (
              // Unauthenticated visitor controls
              <>
                <Link href="/login">
                  <Button
                    variant="outline"
                    size="sm"
                    className="font-semibold text-slate-800 dark:text-slate-100 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-xs px-3.5"
                  >
                    Sign In
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLaunchDemo}
                  isLoading={isDemoLoading}
                  className="hidden sm:inline-flex border-indigo-200 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100 dark:border-indigo-800 dark:text-indigo-300 dark:bg-indigo-950/40"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1 text-indigo-600" />
                  Live Demo (CS 401)
                </Button>
                <Link href="/register">
                  <Button variant="primary" size="sm" className="font-semibold shadow-sm">
                    Get Started
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto text-center flex-1 flex flex-col justify-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-semibold mb-6 mx-auto">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Evidence-Based Academic Diagnostic System</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50 leading-tight sm:leading-tight mb-6">
          Stop guessing what to revise.{' '}
          <span className="text-indigo-600 dark:text-indigo-400 block sm:inline">
            Diagnose your actual knowledge gaps.
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto mb-10 leading-relaxed">
          Conventional chatbots answer questions you ask. GapFinder AI analyzes your syllabus, course notes, and textbooks to identify the concepts you <strong>do not understand</strong>, proves it with grounded diagnostic quizzes, and builds an adaptive revision plan that respects your daily study budget.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-4">
          {!isAuthChecking && currentUser && !isDemoActive ? (
            <>
              <Link href="/dashboard" className="w-full sm:w-auto">
                <Button size="lg" variant="primary" className="w-full sm:w-auto text-base px-8 py-3.5 shadow-sm">
                  <LayoutDashboard className="w-4 h-4 mr-2" />
                  Go to My Dashboard
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Button
                size="lg"
                variant="outline"
                onClick={handleLaunchDemo}
                isLoading={isDemoLoading}
                className="w-full sm:w-auto text-base px-8 py-3.5 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              >
                <Sparkles className="w-4 h-4 mr-2 text-indigo-600" />
                Explore Demo Mode (CS 401)
              </Button>
            </>
          ) : (
            <>
              <Button
                size="lg"
                variant="primary"
                onClick={handleLaunchDemo}
                isLoading={isDemoLoading}
                className="w-full sm:w-auto text-base px-8 py-3.5 shadow-sm"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Launch Instant Demo (CS 401)
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>

              <Link href="/register" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="w-full sm:w-auto text-base px-8 py-3.5 font-medium">
                  Create Free Account
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Prominent Sign In link for registered visitors */}
        {(!currentUser || isDemoActive) && (
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-14">
            Already have an account?{' '}
            <Link
              href="/login"
              className="font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 hover:underline inline-flex items-center gap-1"
            >
              Sign in to your account
              <ArrowRight className="w-3.5 h-3.5 inline" />
            </Link>
          </p>
        )}

        {/* Core Principles Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <Card className="border-slate-200/80 dark:border-slate-800">
            <CardContent className="pt-6">
              <div className="h-10 w-10 rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 flex items-center justify-center mb-4">
                <Target className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">
                100% Grounded in Your Material
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Every quiz question, answer rubric, and diagnostic citation is traced directly to specific pages and sections in your uploaded notes. Never generic model hallucinations.
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 dark:border-slate-800">
            <CardContent className="pt-6">
              <div className="h-10 w-10 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 flex items-center justify-center mb-4">
                <TrendingDown className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">
                Deterministic Gap Engine
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Topic mastery is computed with transparent, mathematical algorithms—never arbitrary model guesses. Insufficient evidence is explicitly distinguished from weak or strong mastery.
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 dark:border-slate-800">
            <CardContent className="pt-6">
              <div className="h-10 w-10 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 flex items-center justify-center mb-4">
                <CalendarCheck className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">
                Time-Budgeted Adaptive Plans
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Prioritizes high-impact weak topics before your target exam date without exceeding your daily study minutes. Dynamically adapts as new quiz attempts prove your progress.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Workflow Step Grid */}
      <section className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              The End-to-End Diagnostic Journey
            </h2>
            <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-2">
              From raw course documents to proven exam readiness in five steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[
              { step: '01', title: 'Upload Material', desc: 'Upload PDF/TXT syllabus, lecture slides, and notes.', icon: BookOpen },
              { step: '02', title: 'Extract Topic Map', desc: 'Automatic hierarchy extraction into Units, Topics & Subtopics.', icon: Layers },
              { step: '03', title: 'Grounded Quizzes', desc: 'Diagnostic MCQs and short answers cited from your notes.', icon: FileCheck2 },
              { step: '04', title: 'Diagnose Gaps', desc: 'Deterministic mastery scoring with specific missed concepts.', icon: TrendingDown },
              { step: '05', title: 'Adaptive Revision', desc: 'Prioritized calendar schedule that adapts as you improve.', icon: CalendarCheck },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.step} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-800/40">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">{s.step}</span>
                    <Icon className="w-4 h-4 text-slate-400" />
                  </div>
                  <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100 mb-1">{s.title}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{s.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-8 px-4 text-center text-xs text-slate-500">
        <p>© 2026 GapFinder AI. Defensible Knowledge Gap Analysis & Grounded Educational Assessment.</p>
      </footer>
    </div>
  );
}
