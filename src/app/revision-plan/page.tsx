'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarCheck,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Plus,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/input';
import { ProgressBar } from '@/components/ui/input';
import { formatDate, getPriorityBadgeStyles } from '@/lib/utils';
import type { RevisionPlan, RevisionPlanItem, Subject, UserProfile } from '@/lib/types';

export default function RevisionPlanPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [plan, setPlan] = useState<RevisionPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Configuration modal state
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [targetExamDate, setTargetExamDate] = useState<string>('');
  const [dailyStudyMinutes, setDailyStudyMinutes] = useState<number>(60);
  const [availableDays, setAvailableDays] = useState<string[]>([
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
    'Sun',
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // Set default target date to 14 days from now
  useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    setTargetExamDate(d.toISOString().split('T')[0]);
  }, []);

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

    async function loadPlan() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/revision-plans?subjectId=${selectedSubjectId}`);
        if (res.ok) {
          const data = await res.json();
          setPlan(data.plan);
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    }
    loadPlan();
  }, [selectedSubjectId]);

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubjectId) return;

    setIsGenerating(true);
    setConfigError(null);

    try {
      const res = await fetch('/api/revision-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectId: selectedSubjectId,
          targetExamDate,
          dailyStudyMinutes,
          availableDays,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate revision plan');

      setPlan(data.plan);
      setShowConfigModal(false);
    } catch (err: any) {
      setConfigError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleToggleTask = async (itemId: string, currentStatus: string) => {
    if (!plan) return;
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';

    // Optimistic UI update
    const updatedItems = (plan.items || []).map((i) =>
      i.id === itemId ? { ...i, status: newStatus as any } : i
    );
    setPlan({ ...plan, items: updatedItems });

    try {
      await fetch(`/api/revision-plans/${plan.id}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, status: newStatus }),
      });
    } catch {
      // Revert if error
      alert('Failed to update task status');
    }
  };

  const toggleDay = (day: string) => {
    if (availableDays.includes(day)) {
      if (availableDays.length === 1) return; // Keep at least one
      setAvailableDays(availableDays.filter((d) => d !== day));
    } else {
      setAvailableDays([...availableDays, day]);
    }
  };

  const items = plan?.items || [];
  const completedCount = items.filter((i) => i.status === 'completed').length;
  const progressPercent = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;
  const totalMinutes = items.reduce((acc, i) => acc + i.estimatedMinutes, 0);

  // Group items by targetDate
  const groupedByDate: Record<string, RevisionPlanItem[]> = {};
  items.forEach((item) => {
    groupedByDate[item.targetDate] = groupedByDate[item.targetDate] || [];
    groupedByDate[item.targetDate].push(item);
  });

  return (
    <AppShell user={user}>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Personalized Revision Plan
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              Strictly budgeted against your available study hours. Dynamically adapts after every diagnostic quiz.
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

            <Button variant="primary" size="sm" onClick={() => setShowConfigModal(true)}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              {plan ? 'Reconfigure Schedule' : 'Create Revision Plan'}
            </Button>
          </div>
        </div>

        {/* Configuration Modal */}
        {showConfigModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 p-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">
                Configure Study Schedule
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Define your target exam date and daily study availability. The algorithm will never exceed your stated capacity.
              </p>

              {configError && <Alert variant="danger" className="mb-4">{configError}</Alert>}

              <form onSubmit={handleCreatePlan} className="space-y-4">
                <Input
                  label="Target Exam / Completion Date"
                  type="date"
                  required
                  value={targetExamDate}
                  onChange={(e) => setTargetExamDate(e.target.value)}
                />

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Daily Study Time Budget (Minutes)
                  </label>
                  <select
                    value={dailyStudyMinutes}
                    onChange={(e) => setDailyStudyMinutes(parseInt(e.target.value, 10))}
                    className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value={30}>30 Minutes / day</option>
                    <option value={45}>45 Minutes / day</option>
                    <option value={60}>60 Minutes (1 Hour) / day</option>
                    <option value={90}>90 Minutes (1.5 Hours) / day</option>
                    <option value={120}>120 Minutes (2 Hours) / day</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Available Study Days
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => {
                      const isSelected = availableDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowConfigModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" size="sm" isLoading={isGenerating}>
                    Generate Prioritized Plan
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Plan Summary Banner */}
        {plan && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <span className="text-[10px] uppercase font-semibold text-slate-500 block">Exam Date</span>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                {formatDate(plan.targetExamDate)}
              </p>
              <span className="text-[11px] text-slate-400">Target completion</span>
            </Card>

            <Card className="p-4">
              <span className="text-[10px] uppercase font-semibold text-slate-500 block">Daily Budget</span>
              <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                {plan.dailyStudyMinutes} min/day
              </p>
              <span className="text-[11px] text-slate-400">
                {plan.availableDays.length} days/week available
              </span>
            </Card>

            <Card className="p-4">
              <span className="text-[10px] uppercase font-semibold text-slate-500 block">Total Workload</span>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                {(totalMinutes / 60).toFixed(1)} Hours
              </p>
              <span className="text-[11px] text-slate-400">{items.length} sessions scheduled</span>
            </Card>

            <Card className="p-4">
              <span className="text-[10px] uppercase font-semibold text-slate-500 block">Plan Progress</span>
              <p className="text-xl font-bold text-emerald-600 mt-1">
                {completedCount} / {items.length} ({progressPercent}%)
              </p>
              <ProgressBar value={progressPercent} className="mt-2" />
            </Card>
          </div>
        )}

        {/* Schedule View */}
        {!plan ? (
          <Card>
            <CardContent className="text-center py-12">
              <CalendarCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1">
                No active revision plan generated yet
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mb-6">
                Tell us your exam date and daily study availability to generate an evidence-prioritized revision schedule.
              </p>
              <Button variant="primary" onClick={() => setShowConfigModal(true)}>
                <Sparkles className="w-4 h-4 mr-1.5" />
                Generate Personalized Plan
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
              <span>Scheduled Revision Calendar</span>
              <span className="text-xs font-normal text-slate-500">
                Sorted chronologically by study date
              </span>
            </h2>

            {Object.keys(groupedByDate).map((dateStr) => {
              const dayTasks = groupedByDate[dateStr];
              const dayMinutes = dayTasks.reduce((acc, t) => acc + t.estimatedMinutes, 0);

              return (
                <div key={dateStr} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                      {formatDate(dateStr)}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {dayMinutes} min allocated
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {dayTasks.map((item) => {
                      const isDone = item.status === 'completed';
                      const badgeClass = getPriorityBadgeStyles(item.priority);

                      return (
                        <Card
                          key={item.id}
                          className={`p-4 transition-all ${
                            isDone
                              ? 'bg-slate-50/60 dark:bg-slate-900/40 opacity-75 border-slate-200/60'
                              : 'hover:border-indigo-300 dark:hover:border-indigo-700'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={isDone}
                                onChange={() => handleToggleTask(item.id, item.status)}
                                className="w-5 h-5 mt-0.5 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                              />
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`font-semibold text-sm ${
                                      isDone
                                        ? 'line-through text-slate-400'
                                        : 'text-slate-900 dark:text-slate-100'
                                    }`}
                                  >
                                    {item.topicName}
                                  </span>
                                  <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold uppercase border ${badgeClass}`}>
                                    {item.priority} Priority
                                  </span>
                                </div>

                                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                                  {item.recommendedActivity}
                                </p>

                                <span className="text-[11px] text-slate-400 mt-1 block italic">
                                  Rationale: {item.reason}
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-col items-end shrink-0 gap-2">
                              <span className="text-xs font-mono font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded">
                                {item.estimatedMinutes} min
                              </span>

                              <Link href={`/quiz/new?subjectId=${selectedSubjectId}&topicId=${item.topicId}`}>
                                <Button variant="outline" size="sm" className="text-xs h-7 px-2">
                                  Practice
                                </Button>
                              </Link>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
