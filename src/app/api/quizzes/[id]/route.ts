import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { repository } from '@/lib/db/repository';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;
  const quiz = await repository.getQuizById(auth.user.id, id);

  if (!quiz) {
    return NextResponse.json({ error: 'Quiz not found or unauthorized' }, { status: 404 });
  }

  // Strip correct answers
  const sanitizedQuestions = (quiz.questions || []).map((q) => ({
    id: q.id,
    topicId: q.topicId,
    questionText: q.questionText,
    questionType: q.questionType,
    difficulty: q.difficulty,
    options: q.options,
  }));

  return NextResponse.json({
    quiz: {
      ...quiz,
      questions: sanitizedQuestions,
    },
  });
}
