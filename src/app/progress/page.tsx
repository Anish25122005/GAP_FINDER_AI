'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Clock,
  ArrowRight,
  HelpCircle,
  BookOpen,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MasteryBadge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import type { Subject, UserProfile } from '@/lib/types';

export default function ProgressPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [progressData, setProgressData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

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

        const subRes = await fetch('/api/subjects');
        if (subRes.ok) {
          const s = await subRes.json();
          setSubjects(s.subjects || []);
          if (s.subjects && s.subjects.length > 0) {
            setSelectedSubjectId(s.subjects[0].id);
          }
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, [router]);

  useEffect(() => {
    if (!selectedSubjectId) return;

    async function loadProgress() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/progress?subjectId=${selectedSubjectId}`);
        if (res.ok) {
          const data = await res.json();
          setProgressData(data);
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    }
    loadProgress();
  }, [selectedSubjectId]);

  const trends = progressData?.historicalTrends || [];
  const weakTopics = progressData?.weakTopics || [];
  const masteredTopics = progressData?.masteredTopics || [];
  const recentAttempts = progressData?.recentAttempts || [];

  return (
    <AppShell user={user}>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Progress & Assessment History
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              Track your diagnostic score trajectory across assessments grounded in actual recorded attempts.
            </p>
          </div>

          {subjects.length > 0 && (
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs sm:text-sm font-medium dark:border-slate-700 dark:bg-slate-900"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code ? `[${s.code}] ` : ''}
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Historical Score Trend Visualizer */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg flex items-center justify-between">
              <span>Diagnostic Assessment Score Trajectory</span>
              <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                {trends.length} recorded assessments
              </span>
            </CardTitle>
            <CardDescription>
              Chronological score percentage across completed diagnostic tests.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {trends.length === 0 ? (
              <div className="text-center py-12 text-slate-500 space-y-3">
                <BarChart3 className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-medium">No prior assessments completed for this course.</p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Historical trends appear here as you complete diagnostic quizzes. Trends are never fabricated.
                </p>
                <Link href={`/quiz/new?subjectId=${selectedSubjectId}`}>
                  <Button variant="outline" size="sm" className="mt-2">
                    Take Your First Quiz
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-6">
                {/* SVG Trend Chart */}
                <div className="h-48 w-full flex items-end gap-3 pt-6 pb-2 px-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800">
                  {trends.map((item: any, idx: number) => {
                    const heightPercent = Math.max(8, item.percentage);
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
                          {item.percentage}%
                        </span>
                        <div
                          className="w-full max-w-[48px] rounded-t-lg bg-indigo-600 hover:bg-indigo-500 transition-all cursor-pointer relative"
                          style={{ height: `${heightPercent}%` }}
                        />
                        <span className="text-[10px] font-mono text-slate-400">
                          Quiz {item.attemptNumber}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 px-2">
                  <span>First Attempt ({trends[0]?.percentage}%)</span>
                  <span>Latest Attempt ({trends[trends.length - 1]?.percentage}%)</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Two Column Mastery Lists */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Mastered Topics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                <span>Mastered Topics (&ge;75%)</span>
              </CardTitle>
              <CardDescription>
                Proven competency demonstrated across diagnostic quizzes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {masteredTopics.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-4">
                  No topics have achieved &ge;75% mastery threshold yet.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {masteredTopics.map((t: any) => (
                    <div
                      key={t.topicId}
                      className="flex items-center justify-between p-3 rounded-lg border border-emerald-100 dark:border-emerald-950 bg-emerald-50/30 dark:bg-emerald-950/20"
                    >
                      <span className="font-semibold text-xs sm:text-sm text-slate-800 dark:text-slate-200">
                        {t.topicName}
                      </span>
                      <span className="font-bold text-xs text-emerald-700 dark:text-emerald-300">
                        {t.masteryScore}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Attention Topics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-rose-700 dark:text-rose-400 flex items-center gap-2">
                <TrendingDown className="w-5 h-5" />
                <span>Knowledge Gaps (&lt;50%)</span>
              </CardTitle>
              <CardDescription>
                Diagnosed deficiencies requiring prioritized revision.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {weakTopics.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-4">
                  No weak topics diagnosed!
                </p>
              ) : (
                <div className="space-y-2.5">
                  {weakTopics.map((t: any) => (
                    <div
                      key={t.topicId}
                      className="flex items-center justify-between p-3 rounded-lg border border-rose-100 dark:border-rose-950 bg-rose-50/30 dark:bg-rose-950/20"
                    >
                      <div>
                        <span className="font-semibold text-xs sm:text-sm text-slate-800 dark:text-slate-200 block">
                          {t.topicName}
                        </span>
                        <span className="text-[11px] text-rose-600 block">
                          {t.keyGaps?.[0] || 'Core principles missed'}
                        </span>
                      </div>
                      <span className="font-bold text-xs text-rose-700 dark:text-rose-300">
                        {t.masteryScore}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Full Assessment History Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Full Assessment Log</CardTitle>
          </CardHeader>
          <CardContent>
            {recentAttempts.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-4">No assessments logged.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
                      <th className="pb-3">Assessment ID</th>
                      <th className="pb-3">Score</th>
                      <th className="pb-3">Percentage</th>
                      <th className="pb-3">Date</th>
                      <th className="pb-3 text-right">Review</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {recentAttempts.map((att: any) => (
                      <tr key={att.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                          {att.id.slice(0, 13)}...
                        </td>
                        <td className="py-3 font-semibold text-slate-800 dark:text-slate-200">
                          {att.totalScore} / {att.maxScore}
                        </td>
                        <td className="py-3 font-bold text-indigo-600">{att.percentage}%</td>
                        <td className="py-3 text-slate-500">{formatDate(att.startedAt)}</td>
                        <td className="py-3 text-right">
                          <Link href={`/quiz/results/${att.id}`}>
                            <Button variant="outline" size="sm" className="text-xs">
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
