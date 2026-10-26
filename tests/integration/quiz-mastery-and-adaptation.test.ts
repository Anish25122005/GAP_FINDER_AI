import { describe, it, expect, beforeEach } from 'vitest';
import { repository } from '@/lib/db/repository';
import { evaluateStudentAnswer } from '@/lib/ai/evaluator';
import { recomputeSubjectMastery } from '@/lib/ai/gap-analyzer';
import { generateRevisionPlan, adaptRevisionPlanAfterQuiz } from '@/lib/ai/revision-planner';
import type { GeneratedQuestion } from '@/lib/types';

describe('Quiz Evaluation, Topic Mastery & Adaptive Revision Integration Tests', () => {
  const userId = 'user_e2e_journey';
  let subjectId: string;
  let topicId: string;
  let question: GeneratedQuestion;

  beforeEach(async () => {
    // 1. Create subject & topic
    const sub = await repository.createSubject(userId, { name: 'Distributed Systems' });
    subjectId = sub.id;

    const topics = await repository.saveTopics(userId, subjectId, [
      { name: 'Consensus Protocols', level: 2, weight: 1.0, orderIndex: 1 },
    ]);
    topicId = topics[0].id;

    // 2. Save grounded question
    const questions = await repository.saveQuestions([
      {
        userId,
        subjectId,
        topicId,
        questionText: 'What is the primary vulnerability of Two-Phase Commit?',
        questionType: 'mcq',
        difficulty: 'medium',
        options: [
          'It is a blocking protocol if the coordinator crashes',
          'It allows Byzantine nodes to inject arbitrary logs',
          'It requires O(N^3) messages per transaction',
          'It cannot run over TCP connections',
        ],
        correctAnswer: 'It is a blocking protocol if the coordinator crashes',
        explanation: 'Cohorts block holding database locks if coordinator fails.',
        citationMetadata: [
          {
            documentId: 'doc_1',
            documentTitle: 'Consensus Notes',
            chunkId: 'chk_1',
            pageNumber: 2,
            sectionTitle: '2PC',
            excerpt: '2PC is a blocking protocol.',
          },
        ],
        isFlagged: false,
      },
    ]);
    question = questions[0];
  });

  it('runs complete assessment workflow: submit -> evaluate -> update mastery -> adapt revision plan', async () => {
    // 1. Create quiz and attempt
    const quiz = await repository.createQuiz(userId, {
      subjectId,
      title: 'Consensus Assessment',
      questionCount: 1,
      topicIds: [topicId],
      questionIds: [question.id],
    });

    const attempt = await repository.createQuizAttempt(userId, quiz.id, subjectId);

    // 2. Submit correct answer
    const studentAnswer = await repository.saveStudentAnswer(userId, attempt.id, question.id, {
      selectedOption: 'It is a blocking protocol if the coordinator crashes',
    });

    // 3. Evaluate answer
    const evaluation = await evaluateStudentAnswer({
      question,
      selectedOption: studentAnswer.selectedOption,
      studentAnswerId: studentAnswer.id,
    });
    await repository.saveEvaluation(evaluation);

    expect(evaluation.score).toBe(1.0);
    expect(evaluation.correctness).toBe('correct');

    await repository.completeQuizAttempt(userId, attempt.id, 1.0, 1);

    // 4. Create active revision plan
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const targetExamDate = d.toISOString().split('T')[0];

    const initialPlan = await generateRevisionPlan({
      userId,
      subjectId,
      targetExamDate,
      dailyStudyMinutes: 60,
      availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    });

    expect(initialPlan.items.length).toBeGreaterThan(0);

    // 5. Mark first item completed
    const firstItemId = initialPlan.items[0].id;
    await repository.updateRevisionPlanItemStatus(userId, firstItemId, 'completed');

    // 6. Recompute mastery
    const updatedMastery = await recomputeSubjectMastery(userId, subjectId);
    expect(updatedMastery.length).toBe(1);
    expect(updatedMastery[0].questionsAttempted).toBe(1);

    // 7. Adapt plan after quiz
    const adaptedPlan = await adaptRevisionPlanAfterQuiz(userId, subjectId);
    expect(adaptedPlan).not.toBeNull();
  });
});
