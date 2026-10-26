import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import { repository } from '@/lib/db/repository';
import { generateQuestionsForTopic } from '@/lib/ai/question-generator';
import type { GeneratedQuestion } from '@/lib/types';

const GenerateQuizSchema = z.object({
  subjectId: z.string().min(1),
  topicIds: z.array(z.string()).min(1, 'Select at least one topic for diagnostic assessment'),
  questionCount: z.number().int().min(2).max(20).default(5),
  title: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    const parsed = GenerateQuizSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid quiz configuration', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { subjectId, topicIds, questionCount, title } = parsed.data;

    const subject = await repository.getSubjectById(auth.user.id, subjectId);
    if (!subject) {
      return NextResponse.json({ error: 'Subject not found or unauthorized' }, { status: 404 });
    }

    const allSubjectTopics = await repository.getTopics(auth.user.id, subjectId);
    const selectedTopics = allSubjectTopics.filter((t) => topicIds.includes(t.id));

    if (selectedTopics.length === 0) {
      return NextResponse.json(
        { error: 'None of the specified topics exist in this subject.' },
        { status: 400 }
      );
    }

    // Allocate question quota per topic
    const perTopic = Math.max(1, Math.floor(questionCount / selectedTopics.length));
    const allGeneratedQuestions: GeneratedQuestion[] = [];
    const topicsWithNoMaterial: string[] = [];

    for (const topic of selectedTopics) {
      // Fetch mapped chunks for this topic
      const mappings = await repository.getMappingsForTopic(topic.id);
      let chunks = mappings.map((m) => m.chunk);

      // If no explicit mappings, fallback to subject chunks
      if (chunks.length === 0) {
        chunks = await repository.getChunksBySubjectId(auth.user.id, subjectId);
      }

      if (chunks.length === 0) {
        topicsWithNoMaterial.push(topic.name);
        continue;
      }

      // Check existing question bank first to avoid redundant generation
      const existing = await repository.getQuestionsByTopic(auth.user.id, topic.id);
      if (existing.length >= perTopic) {
        allGeneratedQuestions.push(...existing.slice(0, perTopic));
      } else {
        const needed = perTopic - existing.length;
        allGeneratedQuestions.push(...existing);
        const newlyGenerated = await generateQuestionsForTopic({
          userId: auth.user.id,
          subjectId,
          topic,
          chunks,
          count: needed,
          preferType: 'mixed',
        });
        allGeneratedQuestions.push(...newlyGenerated);
      }
    }

    if (allGeneratedQuestions.length === 0) {
      return NextResponse.json(
        {
          error: `Cannot generate diagnostic quiz because no learning material has been uploaded or indexed for the selected topics: ${topicsWithNoMaterial.join(', ')}. Please upload notes in the Document Library first.`,
        },
        { status: 400 }
      );
    }

    const finalQuestions = allGeneratedQuestions.slice(0, questionCount);

    // Create Quiz in database
    const quiz = await repository.createQuiz(auth.user.id, {
      subjectId,
      title: title || `${subject.name} - Diagnostic Assessment`,
      questionCount: finalQuestions.length,
      topicIds: selectedTopics.map((t) => t.id),
      questionIds: finalQuestions.map((q) => q.id),
    });

    // Create initial attempt
    const attempt = await repository.createQuizAttempt(auth.user.id, quiz.id, subjectId);

    // Sanitize questions: Never reveal correctAnswer or rubric to client before submission!
    const sanitizedQuestions = finalQuestions.map((q) => ({
      id: q.id,
      topicId: q.topicId,
      questionText: q.questionText,
      questionType: q.questionType,
      difficulty: q.difficulty,
      options: q.options,
      // correctAnswer is deliberately stripped
      // rubric is deliberately stripped
    }));

    return NextResponse.json(
      {
        quiz,
        attemptId: attempt.id,
        questions: sanitizedQuestions,
        topicsWithNoMaterial,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Quiz generation failed' }, { status: 500 });
  }
}
