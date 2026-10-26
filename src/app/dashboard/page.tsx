'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  FileText,
  HelpCircle,
  TrendingDown,
  CalendarCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  PlusCircle,
  Sparkles,
  BarChart2,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MasteryBadge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/input';
import { formatPercent, formatDate } from '@/lib/utils';
import type { UserProfile } from '@/lib/types';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const userRes = await fetch('/api/auth/me');
        if (!userRes.ok) {
          router.push('/login');
          return;
        }
        const userData = await userRes.json();
        setUser(userData.user);

        const progressRes = await fetch('/api/progress');
        if (progressRes.ok) {
          const progressData = await progressRes.json();
          setData(progressData);
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    }
    loadDashboard();
  }, [router]);

  const handleSeedDemo = async () => {
    setIsSeeding(true);
    try {
      const res = await fetch('/api/auth/demo', { method: 'POST' });
      if (res.ok) {
        window.location.reload();
      }
    } catch {
      setIsSeeding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Loading your diagnostic dashboard...</p>
        </div>
      </div>
    );
  }

  const metrics = data?.metrics || {
    totalSubjects: 0,
    totalDocuments: 0,
    totalTopics: 0,
    assessedTopics: 0,
    completedAttemptsCount: 0,
    overallMastery: 0,
    distribution: { weak: 0, medium: 0, strong: 0, insufficientEvidence: 0 },
  };

  const weakTopics = data?.weakTopics || [];
  const planStats = data?.planStats;
  const recentAttempts = data?.recentAttempts || [];
  const hasData = metrics.totalSubjects > 0;

  return (
    <AppShell user={user}>
      <div className="space-y-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Welcome back, {user?.fullName || 'Student'}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Evidence-grounded knowledge gap diagnosis & priority revision tracker.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link href="/quiz/new">
              <Button variant="primary" size="sm">
                <HelpCircle className="w-4 h-4 mr-1.5" />
                Start Diagnostic Quiz
              </Button>
            </Link>
            <Link href="/documents/upload">
              <Button variant="outline" size="sm">
                <FileText className="w-4 h-4 mr-1.5" />
                Upload Notes
              </Button>
            </Link>
          </div>
        </div>

        {/* Empty State Onboarding if no subjects */}
        {!hasData && (
          <Card className="border-indigo-100 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/50 to-white dark:from-indigo-950/20 dark:to-slate-900">
            <CardContent className="pt-6">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 text-xs font-semibold mb-3">
                  <Sparkles className="w-3.5 h-3.5" />
                  Get Started
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
                  No courses or learning materials found yet
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
                  To begin diagnosing knowledge gaps, you can either create your own subject and upload notes, or instantly load our verified sample course: <strong>CS 401 Distributed Systems & Cloud Computing</strong>.
                </p>

                <div className="flex flex-wrap gap-3">
                  <Button variant="primary" onClick={handleSeedDemo} isLoading={isSeeding}>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Load Sample Course (CS 401)
                  </Button>
                  <Link href="/subjects">
                    <Button variant="outline">
                      <PlusCircle className="w-4 h-4 mr-2" />
                      Create New Subject
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Courses</span>
                <BookOpen className="w-4 h-4 text-slate-400" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 mt-2">
                {metrics.totalSubjects}
              </p>
              <span className="text-xs text-slate-500 mt-1 block">{metrics.totalTopics} syllabus topics</span>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Indexed Notes</span>
                <FileText className="w-4 h-4 text-slate-400" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 mt-2">
                {metrics.totalDocuments}
              </p>
              <span className="text-xs text-slate-500 mt-1 block">Vector chunked & cited</span>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Assessed Mastery</span>
                <BarChart2 className="w-4 h-4 text-indigo-600" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-2">
                {metrics.assessedTopics > 0 ? `${metrics.overallMastery}%` : 'N/A'}
              </p>
              <span className="text-xs text-slate-500 mt-1 block">
                {metrics.assessedTopics} of {metrics.totalTopics} topics tested
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Diagnostic Quizzes</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 mt-2">
                {metrics.completedAttemptsCount}
              </p>
              <span className="text-xs text-slate-500 mt-1 block">Completed quiz attempts</span>
            </CardContent>
          </Card>
        </div>

        {/* Topic Mastery Distribution Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Diagnostic Breakdown */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg flex items-center justify-between">
                <span>Knowledge Gap Breakdown</span>
                <Link href="/gap-report" className="text-xs font-semibold text-indigo-600 hover:text-indigo-500">
                  Full Report &rarr;
                </Link>
              </CardTitle>
              <CardDescription>
                Deterministic classification based on observed quiz evidence and threshold boundaries.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <div className="rounded-lg border border-rose-200 bg-rose-50/50 dark:border-rose-900/60 dark:bg-rose-950/20 p-3 text-center">
                  <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">Weak (&lt;50%)</span>
                  <p className="text-2xl font-bold text-rose-700 dark:text-rose-300 mt-1">
                    {metrics.distribution.weak}
                  </p>
                  <span className="text-[10px] text-rose-600/80">Needs Focus</span>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/20 p-3 text-center">
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Medium (50-74%)</span>
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">
                    {metrics.distribution.medium}
                  </p>
                  <span className="text-[10px] text-amber-600/80">Developing</span>
                </div>

                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20 p-3 text-center">
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Strong (&ge;75%)</span>
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">
                    {metrics.distribution.strong}
                  </p>
                  <span className="text-[10px] text-emerald-600/80">Mastered</span>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900 p-3 text-center">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Untested</span>
                  <p className="text-2xl font-bold text-slate-700 dark:text-slate-300 mt-1">
                    {metrics.distribution.insufficientEvidence}
                  </p>
                  <span className="text-[10px] text-slate-500">Need Evidence</span>
                </div>
              </div>

              {/* Urgent Attention Topics List */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Topics Requiring Urgent Revision
                </h4>
                {weakTopics.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-3">
                    {metrics.assessedTopics === 0
                      ? 'No topics have been assessed yet. Start a diagnostic quiz to evaluate your understanding.'
                      : 'Great work! No weak topics detected in your completed assessments.'}
                  </p>
                ) : (
                  weakTopics.slice(0, 3).map((t: any) => (
                    <div
                      key={t.topicId}
                      className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-800 gap-2"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                            {t.topicName}
                          </span>
                          <MasteryBadge status={t.status} score={t.masteryScore} showScore />
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Missed: {t.keyGaps?.slice(0, 2).join(', ') || 'Fundamental principles'}
                        </p>
                      </div>

                      <Link href={`/quiz/new?topicId=${t.topicId}`}>
                        <Button variant="outline" size="sm" className="text-xs shrink-0">
                          Re-Quiz
                        </Button>
                      </Link>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Revision Plan Widget */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg flex items-center justify-between">
                <span>Personalized Revision</span>
                <Link href="/revision-plan" className="text-xs font-semibold text-indigo-600 hover:text-indigo-500">
                  View Plan &rarr;
                </Link>
              </CardTitle>
              <CardDescription>Target-date study schedule</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {planStats ? (
                <>
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3 border border-slate-200/80 dark:border-slate-700/60">
                    <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                      <span>Target Exam Date:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {formatDate(planStats.targetExamDate)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                      <span>Tasks Completed:</span>
                      <span className="font-bold text-indigo-600">
                        {planStats.completedItems} / {planStats.totalItems} ({planStats.completionRate}%)
                      </span>
                    </div>
                  </div>

                  <ProgressBar value={planStats.completionRate} />

                  <p className="text-xs text-slate-500 leading-relaxed">
                    Workload is distributed to respect your stated daily study capacity without burnout.
                  </p>

                  <Link href="/revision-plan" className="block w-full">
                    <Button variant="primary" size="sm" className="w-full">
                      <CalendarCheck className="w-4 h-4 mr-1.5" />
                      Open Study Schedule
                    </Button>
                  </Link>
                </>
              ) : (
                <div className="text-center py-6">
                  <CalendarCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-500 mb-4">
                    No active revision plan set up for this subject yet.
                  </p>
                  <Link href="/revision-plan">
                    <Button variant="outline" size="sm" className="text-xs">
                      Generate Study Plan
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Attempts History Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Recent Diagnostic Attempts</CardTitle>
            <CardDescription>
              Every assessment is evaluated deterministically and cited against your notes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentAttempts.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-4">
                No quiz attempts completed yet. Click &quot;Start Diagnostic Quiz&quot; above to take your first assessment.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
                      <th className="pb-3">Assessment</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3">Score</th>
                      <th className="pb-3">Result</th>
                      <th className="pb-3">Date</th>
                      <th className="pb-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {recentAttempts.map((att: any) => (
                      <tr key={att.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 font-medium text-slate-800 dark:text-slate-200">
                          Diagnostic Quiz
                        </td>
                        <td className="py-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${
                              att.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {att.status}
                          </span>
                        </td>
                        <td className="py-3 font-semibold text-slate-700 dark:text-slate-300">
                          {att.totalScore} / {att.maxScore}
                        </td>
                        <td className="py-3">
                          <span className="font-bold text-indigo-600">{att.percentage}%</span>
                        </td>
                        <td className="py-3 text-slate-500">{formatDate(att.startedAt)}</td>
                        <td className="py-3 text-right">
                          <Link href={`/quiz/results/${att.id}`}>
                            <Button variant="ghost" size="sm" className="text-xs">
                              Review Evidence
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
