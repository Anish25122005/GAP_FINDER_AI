import { describe, it, expect } from 'vitest';
import { calculateTopicMastery, DEFAULT_GAP_CONFIG } from '@/lib/ai/gap-analyzer';
import type { Topic, StudentAnswerWithEvaluation, GeneratedQuestion } from '@/lib/types';

describe('Gap Analysis Engine and Threshold Boundaries Unit Tests', () => {
  const sampleTopic: Topic = {
    id: 'topic_1',
    subjectId: 'sub_1',
    userId: 'user_1',
    name: 'Distributed Consensus & Raft',
    level: 2,
    weight: 1.0,
    orderIndex: 1,
    createdAt: new Date().toISOString(),
  };

  const dummyQuestion: GeneratedQuestion = {
    id: 'q_1',
    userId: 'user_1',
    subjectId: 'sub_1',
    topicId: 'topic_1',
    questionText: 'Explain the Raft leader election mechanism.',
    questionType: 'mcq',
    difficulty: 'medium',
    correctAnswer: 'Candidate receives votes from a majority of nodes',
    explanation: 'Raft requires a quorum of (N/2 + 1) votes.',
    citationMetadata: [],
    createdAt: new Date().toISOString(),
  };

  it('classifies untested topic as insufficient_evidence with 0 mastery', () => {
    const evidence = calculateTopicMastery(sampleTopic, []);
    expect(evidence.status).toBe('insufficient_evidence');
    expect(evidence.masteryScore).toBe(0.0);
    expect(evidence.questionsAttempted).toBe(0);
    expect(evidence.confidence).toBe(0.0);
    expect(evidence.explanation).toContain('No diagnostic questions have been completed');
  });

  it('classifies topic with only 1 question as insufficient_evidence even if answered correctly', () => {
    const singleAnswer: StudentAnswerWithEvaluation = {
      id: 'ans_1',
      attemptId: 'att_1',
      questionId: 'q_1',
      userId: 'user_1',
      selectedOption: 'Candidate receives votes from a majority of nodes',
      question: dummyQuestion,
      evaluation: {
        id: 'eval_1',
        studentAnswerId: 'ans_1',
        correctness: 'correct',
        score: 1.0,
        keyConceptsIdentified: ['Majority quorum'],
        missingConcepts: [],
        incorrectClaims: [],
        explanation: 'Correct.',
        confidence: 1.0,
        createdAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
    };

    const evidence = calculateTopicMastery(sampleTopic, [singleAnswer]);
    // Minimum 2 questions required for confident diagnosis!
    expect(evidence.status).toBe('insufficient_evidence');
    expect(evidence.questionsAttempted).toBe(1);
    expect(evidence.masteryScore).toBe(100.0);
    expect(evidence.explanation).toContain('minimum of 2 questions is required');
  });

  it('classifies performance below 50% as weak mastery with documented missed concepts', () => {
    const answers: StudentAnswerWithEvaluation[] = [
      {
        id: 'ans_1',
        attemptId: 'att_1',
        questionId: 'q_1',
        userId: 'user_1',
        question: dummyQuestion,
        evaluation: {
          id: 'eval_1',
          studentAnswerId: 'ans_1',
          correctness: 'incorrect',
          score: 0.0,
          keyConceptsIdentified: [],
          missingConcepts: ['Leader election timeout'],
          incorrectClaims: [],
          explanation: 'Incorrect election timeout.',
          confidence: 1.0,
          createdAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
      },
      {
        id: 'ans_2',
        attemptId: 'att_1',
        questionId: 'q_1',
        userId: 'user_1',
        question: dummyQuestion,
        evaluation: {
          id: 'eval_2',
          studentAnswerId: 'ans_2',
          correctness: 'incorrect',
          score: 0.0,
          keyConceptsIdentified: [],
          missingConcepts: ['Split-vote resolution'],
          incorrectClaims: [],
          explanation: 'Incorrect split-vote handling.',
          confidence: 1.0,
          createdAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
      },
      {
        id: 'ans_3',
        attemptId: 'att_1',
        questionId: 'q_1',
        userId: 'user_1',
        question: dummyQuestion,
        evaluation: {
          id: 'eval_3',
          studentAnswerId: 'ans_3',
          correctness: 'correct',
          score: 1.0,
          keyConceptsIdentified: ['Log replication'],
          missingConcepts: [],
          incorrectClaims: [],
          explanation: 'Correct.',
          confidence: 1.0,
          createdAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
      },
    ];

    const evidence = calculateTopicMastery(sampleTopic, answers);
    expect(evidence.status).toBe('weak');
    expect(evidence.masteryScore).toBeLessThan(50.0);
    expect(evidence.keyGaps).toContain('Leader election timeout');
    expect(evidence.keyGaps).toContain('Split-vote resolution');
    expect(evidence.recommendation).toContain('Prioritize high-intensity revision');
  });

  it('classifies performance between 50% and 74% as medium mastery', () => {
    const answers: StudentAnswerWithEvaluation[] = [
      {
        id: 'ans_1',
        attemptId: 'att_1',
        questionId: 'q_1',
        userId: 'user_1',
        question: dummyQuestion,
        evaluation: {
          id: 'eval_1',
          studentAnswerId: 'ans_1',
          correctness: 'partially_correct',
          score: 0.7,
          keyConceptsIdentified: ['Quorum'],
          missingConcepts: ['Quorum overlap edge case'],
          incorrectClaims: [],
          explanation: 'Mostly correct.',
          confidence: 1.0,
          createdAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
      },
      {
        id: 'ans_2',
        attemptId: 'att_1',
        questionId: 'q_1',
        userId: 'user_1',
        question: dummyQuestion,
        evaluation: {
          id: 'eval_2',
          studentAnswerId: 'ans_2',
          correctness: 'partially_correct',
          score: 0.5,
          keyConceptsIdentified: ['Term numbers'],
          missingConcepts: ['Log matching property'],
          incorrectClaims: [],
          explanation: 'Partially correct.',
          confidence: 1.0,
          createdAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
      },
    ];

    const evidence = calculateTopicMastery(sampleTopic, answers);
    expect(evidence.status).toBe('medium');
    expect(evidence.masteryScore).toBeGreaterThanOrEqual(50.0);
    expect(evidence.masteryScore).toBeLessThan(75.0);
  });

  it('classifies performance at or above 75% as strong mastery', () => {
    const answers: StudentAnswerWithEvaluation[] = [
      {
        id: 'ans_1',
        attemptId: 'att_1',
        questionId: 'q_1',
        userId: 'user_1',
        question: dummyQuestion,
        evaluation: {
          id: 'eval_1',
          studentAnswerId: 'ans_1',
          correctness: 'correct',
          score: 1.0,
          keyConceptsIdentified: ['Leader election'],
          missingConcepts: [],
          incorrectClaims: [],
          explanation: 'Correct.',
          confidence: 1.0,
          createdAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
      },
      {
        id: 'ans_2',
        attemptId: 'att_1',
        questionId: 'q_1',
        userId: 'user_1',
        question: dummyQuestion,
        evaluation: {
          id: 'eval_2',
          studentAnswerId: 'ans_2',
          correctness: 'correct',
          score: 1.0,
          keyConceptsIdentified: ['Log replication'],
          missingConcepts: [],
          incorrectClaims: [],
          explanation: 'Correct.',
          confidence: 1.0,
          createdAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
      },
    ];

    const evidence = calculateTopicMastery(sampleTopic, answers);
    expect(evidence.status).toBe('strong');
    expect(evidence.masteryScore).toBeGreaterThanOrEqual(75.0);
    expect(evidence.recommendation).toContain('Maintain mastery with periodic spaced repetition');
  });
});
