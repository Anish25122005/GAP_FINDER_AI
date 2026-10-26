import { describe, it, expect } from 'vitest';
import { gradeMultipleChoice, evaluateShortAnswer } from '@/lib/ai/evaluator';
import { validateQuestion } from '@/lib/ai/question-validator';
import { generateQuestionsForTopic } from '@/lib/ai/question-generator';
import { safeReadJsonResponse } from '@/lib/utils';
import type { GeneratedQuestion, DocumentChunk, Topic } from '@/lib/types';

describe('MCQ Deterministic Grading and Evaluator Unit Tests', () => {
  const mcqQuestion: GeneratedQuestion = {
    id: 'mcq_1',
    userId: 'user_1',
    subjectId: 'sub_1',
    topicId: 'top_1',
    questionText: 'What is the required condition for strong consistency in quorum-based replication?',
    questionType: 'mcq',
    difficulty: 'medium',
    options: [
      'R + W > N',
      'R + W < N',
      'R = W = N',
      'R + W = N / 2',
    ],
    correctAnswer: 'R + W > N',
    explanation: 'The read and write quorums must overlap on at least one replica node to guarantee linearizability.',
    citationMetadata: [
      {
        documentId: 'doc_1',
        documentTitle: 'Distributed Systems Notes',
        chunkId: 'chk_1',
        pageNumber: 3,
        sectionTitle: '3.2 Replication',
        excerpt: 'Quorum Rule for Strong Consistency: R + W > N',
      },
    ],
    createdAt: new Date().toISOString(),
  };

  it('grades correct MCQ answer deterministically with 1.0 score', () => {
    const result = gradeMultipleChoice(mcqQuestion, 'R + W > N', 'ans_1');
    expect(result.correctness).toBe('correct');
    expect(result.score).toBe(1.0);
    expect(result.confidence).toBe(1.0);
    expect(result.explanation).toContain('Correct!');
  });

  it('grades incorrect MCQ answer deterministically with 0.0 score', () => {
    const result = gradeMultipleChoice(mcqQuestion, 'R + W < N', 'ans_2');
    expect(result.correctness).toBe('incorrect');
    expect(result.score).toBe(0.0);
    expect(result.missingConcepts).toContain('R + W > N');
    expect(result.incorrectClaims).toContain('R + W < N');
  });

  it('grades unanswered MCQ as incorrect without throwing error', () => {
    const result = gradeMultipleChoice(mcqQuestion, null, 'ans_3');
    expect(result.correctness).toBe('incorrect');
    expect(result.score).toBe(0.0);
    expect(result.explanation).toContain('No option was selected');
  });

  it('evaluates short answers against rubric key concepts', async () => {
    const shortQuestion: GeneratedQuestion = {
      id: 'sq_1',
      userId: 'user_1',
      subjectId: 'sub_1',
      topicId: 'top_1',
      questionText: 'Why is Two-Phase Commit (2PC) considered a blocking protocol?',
      questionType: 'short_answer',
      difficulty: 'hard',
      correctAnswer:
        'If the coordinator crashes after cohorts vote YES, cohorts remain blocked holding locks because they cannot decide commit or abort independently.',
      rubric: {
        keyConcepts: ['coordinator crash', 'cohorts vote YES', 'blocked holding locks'],
        referenceAnswer: 'Cohorts block holding locks if coordinator fails before broadcasting commit.',
      },
      explanation: 'Limitation of 2PC when coordinator fails in phase 2.',
      citationMetadata: [
        {
          documentId: 'doc_1',
          documentTitle: 'Distributed Systems Notes',
          chunkId: 'chk_2',
          pageNumber: 2,
          sectionTitle: '2.2 Consensus Protocols',
          excerpt: 'If coordinator crashes after cohorts vote YES, cohorts remain blocked indefinitely holding database locks.',
        },
      ],
      createdAt: new Date().toISOString(),
    };

    const studentAnswer =
      'Because if the coordinator crashes after cohorts vote YES, the cohorts are blocked holding locks and cannot know whether to commit or abort.';

    const evalResult = await evaluateShortAnswer(shortQuestion, studentAnswer, 'ans_short_1');

    expect(evalResult.score).toBeGreaterThan(0.7);
    expect(evalResult.correctness).toBe('correct');
    expect(evalResult.keyConceptsIdentified.length).toBeGreaterThan(0);
  });

  it('validates question schema: rejects invalid MCQ without 4 distinct options', () => {
    const invalidQuestion = {
      questionText: 'Valid question text here that meets the minimum length requirement?',
      questionType: 'mcq' as const,
      difficulty: 'medium' as const,
      options: ['Option A', 'Option A', 'Option B'], // only 3 options and duplicate!
      correctAnswer: 'Option A',
      citationMetadata: [],
    };

    const validation = validateQuestion(invalidQuestion as any);
    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContain('MCQ must have exactly 4 answer options.');
  });

  it('rejects MCQ options exceeding 160 characters or containing question prompts', () => {
    const paragraphOption =
      'What is Semantic Web? The Semantic Web is an extension of the existing World Wide Web that makes information understandable and processable by computers, allowing machines to intelligently discover, integrate, and analyze web data across heterogeneous systems.';

    const questionWithParagraph: Partial<GeneratedQuestion> = {
      questionText: 'What is the primary function of the Semantic Web according to the materials?',
      questionType: 'mcq',
      difficulty: 'medium',
      options: [
        paragraphOption,
        'A relational database engine',
        'A local area network protocol',
        'A static HTML document viewer',
      ],
      correctAnswer: paragraphOption,
      explanation: 'The Semantic Web extends the Web to make information processable by machines.',
      citationMetadata: [
        {
          chunkId: 'chk_10',
          documentId: 'doc_1',
          documentTitle: 'Semantic Web Notes',
          excerpt: 'The Semantic Web is an extension of the existing World Wide Web...',
        },
      ],
    };

    const validation = validateQuestion(questionWithParagraph);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.some((e) => e.includes('exceeds maximum allowed length of 160 characters'))).toBe(true);
    expect(validation.errors.some((e) => e.includes('question prompt or lecture preamble'))).toBe(true);
  });

  it('generates concise options from long narrative lecture chunks without leaking full paragraphs', async () => {
    const narrativeChunk: DocumentChunk = {
      id: 'chunk_narrative_1',
      documentId: 'doc_semweb_1',
      userId: 'test_user',
      chunkIndex: 0,
      pageNumber: 1,
      sectionTitle: 'Unit 1: Semantic Web',
      content:
        'What is Semantic Web? The Semantic Web is an extension of the existing World Wide Web that makes information understandable and processable by computers. Ravi studies Artificial Intelligence at JNTUH and explores RDF data models and ontology representations for automated machine reasoning.',
      tokenCount: 45,
      createdAt: new Date().toISOString(),
    };

    const topic: Topic = {
      id: 'topic_semweb_1',
      subjectId: 'sub_semweb_1',
      userId: 'test_user',
      name: 'Semantic Web Principles',
      level: 2,
      orderIndex: 1,
      weight: 1.0,
      createdAt: new Date().toISOString(),
    };

    const generated = await generateQuestionsForTopic({
      userId: 'test_user',
      subjectId: 'sub_semweb_1',
      topic,
      chunks: [narrativeChunk],
      count: 1,
      preferType: 'mcq',
    });

    expect(generated.length).toBeGreaterThan(0);
    const mcq = generated.find((q) => q.questionType === 'mcq')!;
    expect(mcq).toBeDefined();
    expect(mcq.options).toBeDefined();
    expect(mcq.options?.length).toBe(4);

    // Verify each option is strictly concise (under 160 characters and under 25 words)
    for (const opt of mcq.options!) {
      expect(opt.length).toBeLessThanOrEqual(160);
      expect(opt.split(/\s+/).length).toBeLessThanOrEqual(25);
      // Ensure the option does NOT contain the question header or student narrative
      expect(opt.toLowerCase()).not.toContain('what is semantic web?');
      expect(opt.toLowerCase()).not.toContain('ravi studies artificial intelligence');
    }

    // Ensure the correct answer is present in options
    expect(mcq.options).toContain(mcq.correctAnswer);

    // Verify passing question validation
    const validation = validateQuestion(mcq);
    expect(validation.isValid).toBe(true);
  });

  it('safeReadJsonResponse safely handles empty, HTML 504, and valid JSON responses', async () => {
    // 1. Valid JSON response
    const validResponse = new Response(JSON.stringify({ success: true, count: 5 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const parsedValid = await safeReadJsonResponse(validResponse);
    expect(parsedValid).toEqual({ success: true, count: 5 });

    // 2. HTML 504 Gateway Timeout response (from Vercel or proxy)
    const html504Response = new Response('<html><head><title>504 Gateway Timeout</title></head><body><h1>Gateway Timeout</h1></body></html>', {
      status: 504,
      statusText: 'Gateway Timeout',
      headers: { 'Content-Type': 'text/html' },
    });
    await expect(safeReadJsonResponse(html504Response)).rejects.toThrow(
      'Request failed with status 504 (Gateway Timeout)'
    );

    // 3. Empty body with 200 OK
    const emptyResponse = new Response('', { status: 200 });
    await expect(safeReadJsonResponse(emptyResponse)).rejects.toThrow(
      'Server returned an empty response. Please try again.'
    );

    // 4. JSON error with error field
    const jsonErrorResponse = new Response(JSON.stringify({ error: 'Syllabus content is too short or unreadable.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
    await expect(safeReadJsonResponse(jsonErrorResponse)).rejects.toThrow(
      'Syllabus content is too short or unreadable.'
    );
  });
});
