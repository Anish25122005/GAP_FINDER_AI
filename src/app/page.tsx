'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function LandingPage() {
  const router = useRouter();
  const [isDemoLoading, setIsDemoLoading] = useState(false);

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-200/80 bg-white/80 dark:border-slate-800/80 dark:bg-slate-900/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
              <GraduationCap className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              GapFinder <span className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 px-1.5 py-0.5 rounded font-mono">AI</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">
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
              <Button variant="primary" size="sm">
                Get Started
              </Button>
            </Link>
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

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <Button
            size="lg"
            variant="primary"
            onClick={handleLaunchDemo}
            isLoading={isDemoLoading}
            className="w-full sm:w-auto text-base px-8 py-3.5"
          >
            Launch Instant Demo (CS 401)
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>

          <Link href="/register" className="w-full sm:w-auto">
            <Button size="lg" variant="outline" className="w-full sm:w-auto text-base px-8 py-3.5">
              Create Free Account
            </Button>
          </Link>
        </div>

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
