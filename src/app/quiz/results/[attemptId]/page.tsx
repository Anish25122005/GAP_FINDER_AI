'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  FileText,
  CalendarCheck,
  TrendingDown,
  Quote,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, MasteryBadge } from '@/components/ui/badge';
import type { QuizAttempt, UserProfile } from '@/lib/types';
import { formatDate } from '@/lib/utils';

function QuizResultsContent() {
  const params = useParams();
  const attemptId = params.attemptId as string;
  const router = useRouter();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [resultsData, setResultsData] = useState<any>(null);
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

        // Check sessionStorage cache from submission
        const cached = sessionStorage.getItem(`results_${attemptId}`);
        if (cached) {
          setResultsData(JSON.parse(cached));
          setIsLoading(false);
          return;
        }

        // Fetch from API
        const attRes = await fetch(`/api/attempts/${attemptId}`);
        if (attRes.ok) {
          const data = await attRes.json();
          // Transform attempt data into view model
          const attempt: QuizAttempt = data.attempt;
          const transformedResults = (attempt.answers || []).map((ans: any) => ({
            questionId: ans.questionId,
            questionText: ans.question?.questionText || 'Diagnostic Question',
            questionType: ans.question?.questionType || 'mcq',
            selectedOption: ans.selectedOption,
            shortAnswerText: ans.shortAnswerText,
            correctAnswer: ans.question?.correctAnswer,
            explanation: ans.question?.explanation,
            citationMetadata: ans.question?.citationMetadata || [],
            evaluation: ans.evaluation,
          }));

          setResultsData({
            attempt,
            score: attempt.totalScore,
            maxScore: attempt.maxScore,
            percentage: attempt.percentage,
            results: transformedResults,
          });
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, [attemptId, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Loading evaluation evidence...</p>
        </div>
      </div>
    );
  }

  const score = resultsData?.score ?? 0;
  const maxScore = resultsData?.maxScore ?? 1;
  const percentage = resultsData?.percentage ?? 0;
  const results = resultsData?.results || [];

  return (
    <AppShell user={user}>
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Results Header Card */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div>
                <span className="text-xs uppercase font-mono tracking-widest text-indigo-300">
                  Diagnostic Assessment Complete
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold mt-1">
                  Evaluation & Knowledge Gap Evidence
                </h1>
                <p className="text-xs sm:text-sm text-slate-300 mt-2 max-w-xl leading-relaxed">
                  Every answer was graded deterministically or evaluated against rubrics grounded strictly in your uploaded course material.
                </p>
              </div>

              <div className="flex flex-col items-center sm:items-end shrink-0 bg-white/10 rounded-2xl p-4 border border-white/10">
                <span className="text-4xl sm:text-5xl font-extrabold">{percentage}%</span>
                <span className="text-xs text-indigo-200 mt-1 font-medium">
                  {score} / {maxScore} Points Scored
                </span>
              </div>
            </div>
          </div>

          <CardContent className="p-4 sm:p-6 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <span className="text-xs text-slate-600 dark:text-slate-400">
                Topic mastery scores and personalized revision priorities have been recalculated.
              </span>

              <div className="flex items-center gap-2">
                <Link href="/gap-report">
                  <Button variant="outline" size="sm" className="text-xs">
                    <TrendingDown className="w-3.5 h-3.5 mr-1 text-indigo-600" />
                    View Gap Report
                  </Button>
                </Link>
                <Link href="/revision-plan">
                  <Button variant="primary" size="sm" className="text-xs">
                    <CalendarCheck className="w-3.5 h-3.5 mr-1" />
                    Updated Revision Plan
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Detailed Question By Question Review */}
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>Detailed Evidence Review</span>
            <span className="text-xs font-normal text-slate-500">
              ({results.length} questions evaluated)
            </span>
          </h2>

          {results.map((res: any, idx: number) => {
            const isCorrect = res.evaluation?.correctness === 'correct';
            const isPartial = res.evaluation?.correctness === 'partially_correct';

            return (
              <Card
                key={res.questionId || idx}
                className={`border-l-4 ${
                  isCorrect
                    ? 'border-l-emerald-500'
                    : isPartial
                    ? 'border-l-amber-500'
                    : 'border-l-rose-500'
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-400">
                        Q{idx + 1}
                      </span>
                      <span className="text-xs uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-semibold">
                        {res.questionType === 'mcq' ? 'Multiple Choice' : 'Short Answer'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isCorrect && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Full Credit (1.0)
                        </span>
                      )}
                      {isPartial && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded">
                          <AlertTriangle className="w-3.5 h-3.5" /> Partial Credit ({res.evaluation?.score})
                        </span>
                      )}
                      {!isCorrect && !isPartial && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950 px-2 py-0.5 rounded">
                          <XCircle className="w-3.5 h-3.5" /> Incorrect (0.0)
                        </span>
                      )}
                    </div>
                  </div>

                  <CardTitle className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                    {res.questionText}
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4 pt-1">
                  {/* Student Answer */}
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3 text-xs sm:text-sm">
                    <span className="text-xs font-semibold text-slate-500 uppercase block mb-1">
                      Your Answer:
                    </span>
                    <p className="font-medium text-slate-800 dark:text-slate-200">
                      {res.selectedOption || res.shortAnswerText || (
                        <span className="italic text-slate-400">Unanswered</span>
                      )}
                    </p>
                  </div>

                  {/* Correct / Reference Answer if incorrect */}
                  {!isCorrect && res.correctAnswer && (
                    <div className="rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 p-3 text-xs sm:text-sm border border-emerald-200 dark:border-emerald-800">
                      <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 uppercase block mb-1">
                        Verified Reference Answer:
                      </span>
                      <p className="font-medium text-emerald-900 dark:text-emerald-200">
                        {res.correctAnswer}
                      </p>
                    </div>
                  )}

                  {/* Rubric Concepts Breakdown */}
                  {res.evaluation && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {res.evaluation.keyConceptsIdentified?.length > 0 && (
                        <div className="rounded-lg bg-emerald-50/40 p-2.5 border border-emerald-100">
                          <span className="font-semibold text-emerald-800 block mb-1">
                            Concepts Identified:
                          </span>
                          <ul className="list-disc list-inside text-emerald-700 space-y-0.5">
                            {res.evaluation.keyConceptsIdentified.map((c: string, i: number) => (
                              <li key={i}>{c}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {res.evaluation.missingConcepts?.length > 0 && (
                        <div className="rounded-lg bg-rose-50/40 p-2.5 border border-rose-100">
                          <span className="font-semibold text-rose-800 block mb-1">
                            Missing Concepts:
                          </span>
                          <ul className="list-disc list-inside text-rose-700 space-y-0.5">
                            {res.evaluation.missingConcepts.map((c: string, i: number) => (
                              <li key={i}>{c}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Grounded Explanation */}
                  {res.explanation && (
                    <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-3">
                      <strong className="text-slate-900 dark:text-slate-100 block mb-1">
                        Diagnostic Rationale:
                      </strong>
                      {res.explanation}
                    </div>
                  )}

                  {/* Source Citations */}
                  {res.citationMetadata && res.citationMetadata.length > 0 && (
                    <div className="rounded-lg bg-indigo-50/40 dark:bg-indigo-950/20 p-3 border border-indigo-100 dark:border-indigo-900/40 text-xs">
                      <div className="flex items-center gap-1.5 font-semibold text-indigo-900 dark:text-indigo-300 mb-1.5">
                        <Quote className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Source Citation from Your Learning Material:</span>
                      </div>
                      {res.citationMetadata.map((cit: any, cIdx: number) => (
                        <div key={cIdx} className="space-y-1">
                          <div className="text-[11px] text-slate-500 font-medium">
                            {cit.documentTitle} {cit.sectionTitle ? `— ${cit.sectionTitle}` : ''}{' '}
                            {cit.pageNumber ? `(Page ${cit.pageNumber})` : ''}
                          </div>
                          <blockquote className="italic text-slate-700 dark:text-slate-300 border-l-2 border-indigo-300 pl-2">
                            &quot;{cit.excerpt}&quot;
                          </blockquote>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Bottom Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          <Link href="/dashboard">
            <Button variant="ghost" size="md">
              Return to Dashboard
            </Button>
          </Link>

          <div className="flex items-center gap-3">
            <Link href="/quiz/new">
              <Button variant="outline" size="md">
                Take Another Quiz
              </Button>
            </Link>
            <Link href="/revision-plan">
              <Button variant="primary" size="md">
                View Prioritized Schedule
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default function QuizResultsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <QuizResultsContent />
    </React.Suspense>
  );
}
