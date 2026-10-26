import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import { repository } from '@/lib/db/repository';
import { evaluateStudentAnswer } from '@/lib/ai/evaluator';
import { recomputeSubjectMastery } from '@/lib/ai/gap-analyzer';
import { adaptRevisionPlanAfterQuiz } from '@/lib/ai/revision-planner';

const SubmitQuizSchema = z.object({
  attemptId: z.string().min(1),
  answers: z.array(
    z.object({
      questionId: z.string().min(1),
      selectedOption: z.string().optional().nullable(),
      shortAnswerText: z.string().optional().nullable(),
    })
  ),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth.errorResponse) return auth.errorResponse;

  const { id: quizId } = await params;

  try {
    const body = await req.json();
    const parsed = SubmitQuizSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid submission data', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { attemptId, answers } = parsed.data;

    const attempt = await repository.getAttemptById(auth.user.id, attemptId);
    if (!attempt) {
      return NextResponse.json({ error: 'Quiz attempt not found or unauthorized' }, { status: 404 });
    }

    if (attempt.status === 'completed') {
      return NextResponse.json(
        { error: 'This quiz attempt has already been submitted and finalized.' },
        { status: 400 }
      );
    }

    let totalScore = 0;
    const maxScore = answers.length;
    const evaluationResults = [];

    for (const ans of answers) {
      const question = await repository.getQuestionById(auth.user.id, ans.questionId);
      if (!question) continue;

      // 1. Save student answer
      const studentAnswer = await repository.saveStudentAnswer(
        auth.user.id,
        attemptId,
        ans.questionId,
        {
          selectedOption: ans.selectedOption || undefined,
          shortAnswerText: ans.shortAnswerText || undefined,
        }
      );

      // 2. Evaluate answer (deterministic MCQ / rubric short-answer)
      const evaluation = await evaluateStudentAnswer({
        question,
        selectedOption: ans.selectedOption,
        shortAnswerText: ans.shortAnswerText,
        studentAnswerId: studentAnswer.id,
      });

      // 3. Save evaluation
      await repository.saveEvaluation(evaluation);

      totalScore += evaluation.score;

      evaluationResults.push({
        questionId: question.id,
        questionText: question.questionText,
        questionType: question.questionType,
        selectedOption: ans.selectedOption,
        shortAnswerText: ans.shortAnswerText,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
        citationMetadata: question.citationMetadata,
        evaluation,
      });
    }

    // 4. Finalize attempt
    const completedAttempt = await repository.completeQuizAttempt(
      auth.user.id,
      attemptId,
      parseFloat(totalScore.toFixed(2)),
      maxScore
    );

    // 5. Recompute Topic Mastery (Gap Analysis Engine)
    const updatedMastery = await recomputeSubjectMastery(auth.user.id, attempt.subjectId);

    // 6. Adapt Revision Plan if active
    await adaptRevisionPlanAfterQuiz(auth.user.id, attempt.subjectId);

    return NextResponse.json({
      attempt: completedAttempt,
      score: totalScore,
      maxScore,
      percentage: maxScore > 0 ? parseFloat(((totalScore / maxScore) * 100).toFixed(1)) : 0,
      results: evaluationResults,
      updatedMastery,
      message: 'Quiz evaluated successfully. Topic mastery and revision priorities updated.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Submission failed' }, { status: 500 });
  }
}
