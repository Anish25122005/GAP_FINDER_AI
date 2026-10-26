import { describe, it, expect } from 'vitest';
import { gradeMultipleChoice, evaluateShortAnswer } from '@/lib/ai/evaluator';
import { validateQuestion } from '@/lib/ai/question-validator';
import type { GeneratedQuestion } from '@/lib/types';

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
});
