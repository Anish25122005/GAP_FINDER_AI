'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  HelpCircle,
  BookOpen,
  Layers,
  ArrowRight,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/input';
import type { Subject, Topic, UserProfile } from '@/lib/types';

function NewQuizContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedSubjectId = searchParams.get('subjectId');
  const preselectedTopicId = searchParams.get('topicId');

  const [user, setUser] = useState<UserProfile | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          const defaultSubId =
            preselectedSubjectId || (s.subjects && s.subjects.length > 0 ? s.subjects[0].id : '');
          setSelectedSubjectId(defaultSubId);
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, [preselectedSubjectId, router]);

  // Load topics whenever selectedSubjectId changes
  useEffect(() => {
    if (!selectedSubjectId) {
      setTopics([]);
      setSelectedTopicIds([]);
      return;
    }

    async function loadTopics() {
      try {
        const res = await fetch(`/api/subjects/${selectedSubjectId}/topics`);
        if (res.ok) {
          const data = await res.json();
          const topicList: Topic[] = data.topics || [];
          setTopics(topicList);

          if (preselectedTopicId && topicList.some((t) => t.id === preselectedTopicId)) {
            setSelectedTopicIds([preselectedTopicId]);
          } else {
            // Select all topics by default
            setSelectedTopicIds(topicList.map((t) => t.id));
          }
        }
      } catch {
        // ignore
      }
    }
    loadTopics();
  }, [selectedSubjectId, preselectedTopicId]);

  const toggleTopic = (id: string) => {
    if (selectedTopicIds.includes(id)) {
      setSelectedTopicIds(selectedTopicIds.filter((tId) => tId !== id));
    } else {
      setSelectedTopicIds([...selectedTopicIds, id]);
    }
  };

  const selectAllTopics = () => {
    setSelectedTopicIds(topics.map((t) => t.id));
  };

  const deselectAllTopics = () => {
    setSelectedTopicIds([]);
  };

  const handleGenerateQuiz = async () => {
    if (selectedTopicIds.length === 0) {
      setError('Please select at least one syllabus topic to assess.');
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      const res = await fetch('/api/quizzes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectId: selectedSubjectId,
          topicIds: selectedTopicIds,
          questionCount,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate diagnostic quiz.');
      }

      // Store active quiz payload in sessionStorage for smooth offline/instant loading
      sessionStorage.setItem(`quiz_${data.quiz.id}`, JSON.stringify(data));

      router.push(`/quiz/${data.quiz.id}?attemptId=${data.attemptId}`);
    } catch (err: any) {
      setError(err.message);
      setIsGenerating(false);
    }
  };

  return (
    <AppShell user={user}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Configure Diagnostic Assessment
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Questions are generated strictly from your uploaded course notes to pinpoint knowledge gaps.
          </p>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        {subjects.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1">
                No courses found
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mb-6">
                Create a course and upload notes first before generating diagnostic quizzes.
              </p>
              <Link href="/dashboard">
                <Button variant="primary">Return to Dashboard</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Step 1: Course Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">1. Select Course</CardTitle>
              </CardHeader>
              <CardContent>
                <select
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium dark:border-slate-700 dark:bg-slate-900"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code ? `[${s.code}] ` : ''}
                      {s.name}
                    </option>
                  ))}
                </select>
              </CardContent>
            </Card>

            {/* Step 2: Topics Selection */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">2. Target Syllabus Topics</CardTitle>
                    <CardDescription>
                      Select the specific topics you want to diagnose.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllTopics}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-500"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={deselectAllTopics}
                      className="text-xs text-slate-500 hover:text-slate-700"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {topics.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-500">
                    No topics found for this course. Please import a syllabus outline in the Course details page.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {topics.map((t) => {
                      const isSelected = selectedTopicIds.includes(t.id);
                      return (
                        <div
                          key={t.id}
                          onClick={() => toggleTopic(t.id)}
                          className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                            isSelected
                              ? 'border-indigo-500 bg-indigo-50/50 dark:border-indigo-800 dark:bg-indigo-950/30'
                              : 'border-slate-200 hover:border-slate-300 dark:border-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                            />
                            <div>
                              <span className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200">
                                {t.name}
                              </span>
                              {t.level === 1 && (
                                <span className="ml-2 text-[10px] font-bold text-slate-400 uppercase">
                                  (Unit)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Step 3: Question Count */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">3. Assessment Size</CardTitle>
                <CardDescription>
                  Choose the number of diagnostic questions to generate.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  {[3, 5, 8].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setQuestionCount(count)}
                      className={`p-3 rounded-lg border text-center font-bold text-sm transition-colors cursor-pointer ${
                        questionCount === count
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                          : 'border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {count} Questions
                      <span className="block text-[11px] font-normal text-slate-500 mt-0.5">
                        ~{count * 2} minutes
                      </span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Action Button */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Link href="/dashboard">
                <Button variant="ghost" size="md">
                  Cancel
                </Button>
              </Link>
              <Button
                variant="primary"
                size="md"
                onClick={handleGenerateQuiz}
                isLoading={isGenerating}
                disabled={selectedTopicIds.length === 0}
              >
                {isGenerating ? 'Synthesizing Grounded Questions...' : 'Generate & Start Diagnostic Quiz'}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function NewQuizPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <NewQuizContent />
    </React.Suspense>
  );
}
