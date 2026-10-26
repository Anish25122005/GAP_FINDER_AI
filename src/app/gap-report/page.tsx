'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  BookOpen,
  Filter,
  RefreshCw,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, MasteryBadge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/input';
import { formatPercent, formatDate } from '@/lib/utils';
import type { TopicMasterySnapshot, Subject, UserProfile, MasteryStatus } from '@/lib/types';

export default function GapReportPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [summary, setSummary] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

    async function loadGapReport() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/gap-report?subjectId=${selectedSubjectId}`);
        if (res.ok) {
          const data = await res.json();
          setSummary(data.summary);
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    }
    loadGapReport();
  }, [selectedSubjectId]);

  const handleRefresh = async () => {
    if (!selectedSubjectId) return;
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/gap-report?subjectId=${selectedSubjectId}&refresh=true`);
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
      }
    } catch {
      // ignore
    } finally {
      setIsRefreshing(false);
    }
  };

  const snapshots: TopicMasterySnapshot[] = summary?.topicSnapshots || [];

  const filteredSnapshots = snapshots.filter((s) => {
    if (statusFilter === 'all') return true;
    return s.status === statusFilter;
  });

  return (
    <AppShell user={user}>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-xs font-semibold mb-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Evidence-Grounding Guarantee</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Knowledge Gap Diagnosis
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              Deterministic, mathematical topic mastery estimates calculated exclusively from observed quiz evidence and threshold boundaries.
            </p>
          </div>

          <div className="flex items-center gap-3">
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

            <Button variant="outline" size="sm" onClick={handleRefresh} isLoading={isRefreshing} title="Recalculate Mastery">
              <RefreshCw className="w-3.5 h-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Recalculate</span>
            </Button>
          </div>
        </div>

        {/* Aggregate KPI Strip */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card className="p-4 text-center">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Tested Mastery</span>
              <p className="text-2xl sm:text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
                {summary.assessedTopics > 0 ? `${summary.overallMastery}%` : 'N/A'}
              </p>
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                {summary.assessedTopics} of {summary.totalTopics} topics
              </span>
            </Card>

            <Card className="p-4 text-center border-rose-200 bg-rose-50/40 dark:border-rose-900/60 dark:bg-rose-950/20">
              <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 uppercase">Weak Gaps</span>
              <p className="text-2xl sm:text-3xl font-extrabold text-rose-700 dark:text-rose-300 mt-1">
                {summary.weakCount}
              </p>
              <span className="text-[10px] text-rose-600/70 mt-0.5 block">&lt; 50% Mastery</span>
            </Card>

            <Card className="p-4 text-center border-amber-200 bg-amber-50/40 dark:border-amber-900/60 dark:bg-amber-950/20">
              <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 uppercase">Developing</span>
              <p className="text-2xl sm:text-3xl font-extrabold text-amber-700 dark:text-amber-300 mt-1">
                {summary.mediumCount}
              </p>
              <span className="text-[10px] text-amber-600/70 mt-0.5 block">50% - 74% Mastery</span>
            </Card>

            <Card className="p-4 text-center border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/20">
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase">Mastered</span>
              <p className="text-2xl sm:text-3xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-1">
                {summary.strongCount}
              </p>
              <span className="text-[10px] text-emerald-600/70 mt-0.5 block">&ge; 75% Mastery</span>
            </Card>

            <Card className="p-4 text-center col-span-2 sm:col-span-1 border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase">Untested</span>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-700 dark:text-slate-300 mt-1">
                {summary.insufficientEvidenceCount}
              </p>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Insufficient Evidence</span>
            </Card>
          </div>
        )}

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Filter by State:
          </span>
          {[
            { id: 'all', label: `All (${snapshots.length})` },
            { id: 'weak', label: `Weak (${summary?.weakCount ?? 0})` },
            { id: 'medium', label: `Developing (${summary?.mediumCount ?? 0})` },
            { id: 'strong', label: `Mastered (${summary?.strongCount ?? 0})` },
            { id: 'insufficient_evidence', label: `Untested (${summary?.insufficientEvidenceCount ?? 0})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Topic Gap Cards Grid */}
        {filteredSnapshots.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <TrendingDown className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1">
                No topics in this category
              </h3>
              <p className="text-xs text-slate-500">
                Switch filters above or complete diagnostic quizzes to update classifications.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredSnapshots.map((item) => (
              <Card
                key={item.topicId}
                className="flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                        {item.topicName}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <MasteryBadge status={item.status} score={item.masteryScore} showScore />
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {item.status !== 'insufficient_evidence' ? (
                        <>
                          <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
                            {item.masteryScore}%
                          </span>
                          <span className="block text-[10px] text-slate-400">Mastery Score</span>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400 italic">No score</span>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-1">
                  {/* Evidence Metrics Strip */}
                  <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 p-2.5 text-center text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase block">Attempted</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {item.questionsAttempted} Qs
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase block">Performance</span>
                      <span className="font-bold text-emerald-600">
                        {item.correctCount}✔ / {item.incorrectCount}✘
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase block">Confidence</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {(item.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {/* Identified Knowledge Gaps */}
                  {item.keyGaps && item.keyGaps.length > 0 && item.status !== 'strong' && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-semibold uppercase text-rose-700 dark:text-rose-400 block">
                        Identified Conceptual Gaps:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {item.keyGaps.map((gap, gIdx) => (
                          <span
                            key={gIdx}
                            className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-900"
                          >
                            {gap}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommendation and Action */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500">
                      {item.questionsAttempted === 0
                        ? 'Untested topic'
                        : `Last assessed: ${formatDate(item.lastAssessmentAt)}`}
                    </span>

                    <Link href={`/quiz/new?subjectId=${selectedSubjectId}&topicId=${item.topicId}`}>
                      <Button variant="outline" size="sm" className="text-xs">
                        {item.questionsAttempted === 0 ? 'Evaluate Topic' : 'Targeted Quiz'}
                        <ArrowRight className="w-3.5 h-3.5 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
