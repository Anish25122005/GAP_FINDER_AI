'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import {
  HelpCircle,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
  Send,
  Flag,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/input';
import { Alert } from '@/components/ui/input';
import type { Quiz, GeneratedQuestion, UserProfile } from '@/lib/types';

function ActiveQuizContent() {
  const params = useParams();
  const quizId = params.id as string;
  const searchParams = useSearchParams();
  const attemptId = searchParams.get('attemptId');
  const router = useRouter();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Student answer state: key = questionId, value = { selectedOption?: string, shortAnswerText?: string }
  const [answers, setAnswers] = useState<Record<string, { selectedOption?: string; shortAnswerText?: string }>>({});

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
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

        // Check if cached in sessionStorage from generation
        const cached = sessionStorage.getItem(`quiz_${quizId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          setQuiz(parsed.quiz);
          setQuestions(parsed.questions || []);
          setIsLoading(false);
          return;
        }

        // Fetch from server
        const quizRes = await fetch(`/api/quizzes/${quizId}`);
        if (!quizRes.ok) throw new Error('Quiz not found or unauthorized');

        const quizData = await quizRes.json();
        setQuiz(quizData.quiz);
        setQuestions(quizData.quiz.questions || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, [quizId, router]);

  const currentQuestion = questions[currentIndex];

  const handleSelectOption = (option: string) => {
    if (!currentQuestion) return;
    setAnswers({
      ...answers,
      [currentQuestion.id]: {
        ...answers[currentQuestion.id],
        selectedOption: option,
      },
    });
  };

  const handleShortAnswerChange = (text: string) => {
    if (!currentQuestion) return;
    setAnswers({
      ...answers,
      [currentQuestion.id]: {
        ...answers[currentQuestion.id],
        shortAnswerText: text,
      },
    });
  };

  const handleSubmitQuiz = async () => {
    if (!attemptId) {
      setError('Active quiz attempt ID missing. Please launch the quiz from the Quiz Configuration page.');
      return;
    }

    if (!confirm('Are you ready to submit your assessment for diagnostic evaluation?')) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const payloadAnswers = questions.map((q) => ({
        questionId: q.id,
        selectedOption: answers[q.id]?.selectedOption || null,
        shortAnswerText: answers[q.id]?.shortAnswerText || null,
      }));

      const res = await fetch(`/api/quizzes/${quizId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId,
          answers: payloadAnswers,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit quiz.');

      // Store results in sessionStorage
      sessionStorage.setItem(`results_${attemptId}`, JSON.stringify(data));

      router.push(`/quiz/results/${attemptId}`);
    } catch (err: any) {
      setError(err.message);
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Preparing diagnostic assessment...</p>
        </div>
      </div>
    );
  }

  if (error || !currentQuestion) {
    return (
      <AppShell user={user}>
        <div className="max-w-xl mx-auto py-12 text-center space-y-4">
          <Alert variant="danger">{error || 'No questions available in this assessment.'}</Alert>
          <Link href="/quiz/new">
            <Button variant="primary">Configure New Quiz</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const answeredCount = Object.keys(answers).length;
  const progressPercent = Math.round(((currentIndex + 1) / questions.length) * 100);

  return (
    <AppShell user={user}>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Progress Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Diagnostic Assessment
            </span>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">
              {quiz?.title || 'Course Diagnostic'}
            </h2>
          </div>

          <div className="text-right">
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
              Question {currentIndex + 1} of {questions.length}
            </span>
            <span className="block text-[11px] text-slate-500">
              {answeredCount} answered
            </span>
          </div>
        </div>

        <ProgressBar value={progressPercent} />

        {/* Active Question Card */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {currentQuestion.questionType === 'mcq' ? 'Multiple Choice' : 'Short Answer Evaluation'}
              </span>
              <span className="text-xs font-mono text-slate-400 uppercase">
                Difficulty: {currentQuestion.difficulty || 'medium'}
              </span>
            </div>

            <CardTitle className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">
              {currentQuestion.questionText}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4 pt-2">
            {/* Multiple Choice Options */}
            {currentQuestion.questionType === 'mcq' && currentQuestion.options && (
              <div className="space-y-2.5">
                {currentQuestion.options.map((option: string, idx: number) => {
                  const letter = String.fromCharCode(65 + idx);
                  const isSelected = answers[currentQuestion.id]?.selectedOption === option;

                  return (
                    <div
                      key={idx}
                      onClick={() => handleSelectOption(option)}
                      className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/70 dark:border-indigo-500 dark:bg-indigo-950/40 shadow-sm ring-1 ring-indigo-600'
                          : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 hover:bg-slate-50/50'
                      }`}
                    >
                      <div
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold border transition-colors ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {letter}
                      </div>
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-relaxed pt-0.5">
                        {option}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Short Answer Input */}
            {currentQuestion.questionType === 'short_answer' && (
              <div className="space-y-2">
                <textarea
                  rows={5}
                  value={answers[currentQuestion.id]?.shortAnswerText || ''}
                  onChange={(e) => handleShortAnswerChange(e.target.value)}
                  placeholder="Explain the concept clearly in your own words based on your course notes..."
                  className="w-full rounded-xl border border-slate-300 bg-white p-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:border-slate-700 dark:bg-slate-900 leading-relaxed"
                />
                <p className="text-xs text-slate-500">
                  Tip: Focus on accurately communicating the required concepts and definitions. Fluency alone is not credited.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation & Submission Controls */}
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="md"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex(currentIndex - 1)}
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Previous
          </Button>

          {currentIndex < questions.length - 1 ? (
            <Button
              variant="primary"
              size="md"
              onClick={() => setCurrentIndex(currentIndex + 1)}
            >
              Next Question
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          ) : (
            <Button
              variant="primary"
              size="md"
              onClick={handleSubmitQuiz}
              isLoading={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-600 shadow-sm"
            >
              <Send className="w-4 h-4 mr-1.5" />
              Submit Assessment for Diagnosis
            </Button>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function ActiveQuizPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ActiveQuizContent />
    </React.Suspense>
  );
}
