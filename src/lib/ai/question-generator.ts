import { z } from 'zod';
import { aiProvider, sanitizeUntrustedContent } from './provider';
import { validateQuestion } from './question-validator';
import type { GeneratedQuestion, DocumentChunk, Topic, CitationMetadata } from '@/lib/types';
import { repository } from '@/lib/db/repository';

const GeneratedQuestionSchema = z.object({
  questionText: z.string().min(15),
  questionType: z.enum(['mcq', 'short_answer']),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  options: z.array(z.string()).length(4).optional(),
  correctAnswer: z.string().min(1),
  explanation: z.string().min(10),
  keyConcepts: z.array(z.string()).optional(),
  citedExcerpt: z.string().min(10),
});

const QuestionBatchSchema = z.object({
  questions: z.array(GeneratedQuestionSchema),
});

export interface QuestionGenerationOptions {
  userId: string;
  subjectId: string;
  topic: Topic;
  chunks: DocumentChunk[];
  count?: number;
  preferType?: 'mcq' | 'short_answer' | 'mixed';
}

/**
 * Generates grounded diagnostic questions for a topic using retrieved chunks.
 */
export async function generateQuestionsForTopic(
  options: QuestionGenerationOptions
): Promise<GeneratedQuestion[]> {
  const { userId, subjectId, topic, chunks, count = 3, preferType = 'mixed' } = options;

  if (chunks.length === 0) {
    throw new Error(
      `Cannot generate diagnostic questions for topic "${topic.name}" because no learning material has been uploaded or mapped to this topic.`
    );
  }

  // Combine top chunks for prompt context
  const contextText = chunks
    .slice(0, 4)
    .map((c, idx) => `[Source Chunk ${idx + 1} | Page ${c.pageNumber || 'N/A'} | Section: ${c.sectionTitle || 'General'}]\n${c.content}`)
    .join('\n\n---\n\n');

  const sanitizedContext = sanitizeUntrustedContent(contextText);

  const prompt = `
You are an expert diagnostic exam author. Generate ${count} diagnostic assessment questions for the syllabus topic: "${topic.name}".

Context Material:
<<<UNTRUSTED_RETRIEVED_CONTEXT>>>
${sanitizedContext}
<<<UNTRUSTED_RETRIEVED_CONTEXT>>>

Requirements:
1. Every question MUST be strictly grounded in the facts presented in the retrieved context material above.
2. Generate question types: ${preferType === 'mixed' ? 'A mix of multiple-choice (MCQ) and short-answer' : preferType}.
3. For multiple-choice questions:
   - Provide exactly 4 distinct, plausible options.
   - Exactly one option must be strictly correct according to the context.
   - Three options must be plausible distractors representing common student misconceptions.
4. For short-answer questions:
   - Provide a concise reference answer.
   - List 2 to 4 key concepts required for grading.
5. In "citedExcerpt", quote the exact 1-2 sentence evidence from the context that proves the answer.
6. Provide a clear educational explanation of why the answer is correct and why common misconceptions fail.
7. Return a JSON object with a "questions" array.
`;

  const fallbackGenerator = (): z.infer<typeof QuestionBatchSchema> => {
    // Generate deterministic grounded questions directly from chunk content for offline/test environments
    const firstChunk = chunks[0];
    const excerpt = firstChunk.content.slice(0, 180).trim();
    const sentences = firstChunk.content.split('. ').filter((s) => s.length > 20);

    const questions: z.infer<typeof GeneratedQuestionSchema>[] = [];

    // 1. MCQ
    const keySentence = sentences[0] || `The topic of ${topic.name} is defined in course materials.`;
    questions.push({
      questionText: `According to the course notes on ${topic.name}, what is the primary function or principle described?`,
      questionType: 'mcq',
      difficulty: 'medium',
      options: [
        keySentence.trim().replace(/\.$/, ''),
        `It operates independently without any relation to ${topic.name}.`,
        `It bypasses standard validation rules completely.`,
        `It is deprecated and replaced by ungrounded assumptions.`,
      ],
      correctAnswer: keySentence.trim().replace(/\.$/, ''),
      explanation: `As stated directly in the course materials: "${excerpt}...", this represents the primary verified definition.`,
      citedExcerpt: excerpt,
    });

    // 2. Short Answer if requested
    if (count > 1) {
      const secondSentence = sentences[1] || `Key concepts include structured analysis and evidence evaluation.`;
      questions.push({
        questionText: `Explain how ${topic.name} is implemented and identify its key considerations based on your course notes.`,
        questionType: 'short_answer',
        difficulty: 'medium',
        correctAnswer: secondSentence,
        explanation: `Course text states: "${secondSentence}". A complete response must address this core mechanism.`,
        keyConcepts: [topic.name, 'Implementation considerations', 'Core mechanism'],
        citedExcerpt: secondSentence.slice(0, 150),
      });
    }

    return { questions };
  };

  let rawQuestions: z.infer<typeof GeneratedQuestionSchema>[] = [];

  try {
    const result = await aiProvider.generateStructuredOutput(
      [{ role: 'user', content: prompt }],
      QuestionBatchSchema,
      fallbackGenerator
    );
    rawQuestions = result.questions;
  } catch {
    rawQuestions = fallbackGenerator().questions;
  }

  // Validate and construct domain objects with source citation links
  const validatedQuestions: GeneratedQuestion[] = [];

  for (const q of rawQuestions) {
    // Associate with the most relevant chunk
    const matchingChunk =
      chunks.find((c) => c.content.includes(q.citedExcerpt.slice(0, 30))) || chunks[0];

    const citation: CitationMetadata = {
      documentId: matchingChunk.documentId,
      documentTitle: matchingChunk.sectionTitle || 'Document Material',
      chunkId: matchingChunk.id,
      pageNumber: matchingChunk.pageNumber,
      sectionTitle: matchingChunk.sectionTitle,
      excerpt: q.citedExcerpt,
    };

    const candidate: Omit<GeneratedQuestion, 'id' | 'createdAt'> = {
      userId,
      subjectId,
      topicId: topic.id,
      questionText: q.questionText,
      questionType: q.questionType,
      difficulty: q.difficulty,
      options: q.options,
      correctAnswer: q.correctAnswer,
      rubric:
        q.questionType === 'short_answer'
          ? {
              keyConcepts: q.keyConcepts || [topic.name],
              referenceAnswer: q.correctAnswer,
            }
          : undefined,
      explanation: q.explanation,
      citationMetadata: [citation],
      isFlagged: false,
    };

    const validation = validateQuestion(candidate);
    if (validation.isValid) {
      validatedQuestions.push({
        ...candidate,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      });
    } else {
      console.warn('Discarded invalid generated question:', validation.errors);
    }
  }

  if (validatedQuestions.length === 0) {
    // Run fallback generator as fail-safe guarantee
    const fb = fallbackGenerator();
    for (const q of fb.questions) {
      const matchingChunk = chunks[0];
      const citation: CitationMetadata = {
        documentId: matchingChunk.documentId,
        documentTitle: matchingChunk.sectionTitle || 'Document Material',
        chunkId: matchingChunk.id,
        pageNumber: matchingChunk.pageNumber,
        sectionTitle: matchingChunk.sectionTitle,
        excerpt: q.citedExcerpt,
      };
      validatedQuestions.push({
        id: crypto.randomUUID(),
        userId,
        subjectId,
        topicId: topic.id,
        questionText: q.questionText,
        questionType: q.questionType,
        difficulty: q.difficulty,
        options: q.options,
        correctAnswer: q.correctAnswer,
        rubric:
          q.questionType === 'short_answer'
            ? {
                keyConcepts: q.keyConcepts || [topic.name],
                referenceAnswer: q.correctAnswer,
              }
            : undefined,
        explanation: q.explanation,
        citationMetadata: [citation],
        isFlagged: false,
        createdAt: new Date().toISOString(),
      });
    }
  }

  // Persist generated questions into the question repository
  await repository.saveQuestions(validatedQuestions);
  return validatedQuestions;
}
