import { describe, it, expect, beforeEach } from 'vitest';
import { generateRevisionPlan } from '@/lib/ai/revision-planner';
import { repository } from '@/lib/db/repository';

describe('Revision Plan Prioritization and Time Budget Unit Tests', () => {
  const userId = 'user_test_budget';
  const subjectId = 'sub_test_budget';

  beforeEach(async () => {
    // Setup subject and topics with varying weights and mastery
    await repository.createSubject(userId, { name: 'Algorithms & Complexity', code: 'CS 301' });

    const topics = [
      { name: 'Topic A: Dynamic Programming', level: 2, weight: 1.5, orderIndex: 1 },
      { name: 'Topic B: Graph Traversals', level: 2, weight: 1.0, orderIndex: 2 },
      { name: 'Topic C: Sorting Lower Bounds', level: 2, weight: 0.8, orderIndex: 3 },
    ];
    const saved = await repository.saveTopics(userId, subjectId, topics as any);

    // Save mastery: Topic A is Weak (30%), Topic B is Medium (60%), Topic C is Strong (90%)
    await repository.saveMasterySnapshot({
      userId,
      subjectId,
      topicId: saved[0].id,
      masteryScore: 30.0,
      status: 'weak',
      questionsAttempted: 4,
      correctCount: 1,
      incorrectCount: 3,
      confidence: 0.8,
      keyGaps: ['Optimal substructure proofs'],
      lastAssessmentAt: new Date().toISOString(),
    });

    await repository.saveMasterySnapshot({
      userId,
      subjectId,
      topicId: saved[1].id,
      masteryScore: 60.0,
      status: 'medium',
      questionsAttempted: 4,
      correctCount: 2,
      incorrectCount: 2,
      confidence: 0.8,
      keyGaps: ['DFS cycle detection'],
      lastAssessmentAt: new Date().toISOString(),
    });

    await repository.saveMasterySnapshot({
      userId,
      subjectId,
      topicId: saved[2].id,
      masteryScore: 90.0,
      status: 'strong',
      questionsAttempted: 4,
      correctCount: 4,
      incorrectCount: 0,
      confidence: 0.8,
      keyGaps: [],
      lastAssessmentAt: new Date().toISOString(),
    });
  });

  it('prioritizes high-weight weak topics first in the schedule', async () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const targetExamDate = d.toISOString().split('T')[0];

    const result = await generateRevisionPlan({
      userId,
      subjectId,
      targetExamDate,
      dailyStudyMinutes: 60,
      availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    });

    expect(result.items.length).toBeGreaterThan(0);
    // Topic A (Weak, 1.5x weight) should have high priority and appear first
    const firstItem = result.items[0];
    expect(firstItem.topicName).toContain('Topic A');
    expect(firstItem.priority).toBe('high');
  });

  it('enforces strict daily study budget: daily allocated minutes <= dailyStudyMinutes', async () => {
    const d = new Date();
    d.setDate(d.getDate() + 10);
    const targetExamDate = d.toISOString().split('T')[0];
    const dailyLimit = 60;

    const result = await generateRevisionPlan({
      userId,
      subjectId,
      targetExamDate,
      dailyStudyMinutes: dailyLimit,
      availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    });

    // Group items by date and sum durations
    const dailySums: Record<string, number> = {};
    for (const item of result.items) {
      dailySums[item.targetDate] = (dailySums[item.targetDate] || 0) + item.estimatedMinutes;
    }

    for (const [date, minutes] of Object.entries(dailySums)) {
      // In standard capacity, should not exceed dailyLimit
      if (!result.isCapacityConstrained) {
        expect(minutes).toBeLessThanOrEqual(dailyLimit);
      }
    }
  });

  it('detects capacity constraint and warns student when exam is too soon for full workload', async () => {
    // Exam is tomorrow, only 30 min available, but 3 topics need ~125 minutes total
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const targetExamDate = d.toISOString().split('T')[0];

    const result = await generateRevisionPlan({
      userId,
      subjectId,
      targetExamDate,
      dailyStudyMinutes: 30,
      availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    });

    expect(result.isCapacityConstrained).toBe(true);
    expect(result.capacityShortfallMinutes).toBeGreaterThan(0);
    expect(result.summaryExplanation).toContain('exceeds your daily study capacity');
  });
});
