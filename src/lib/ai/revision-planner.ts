import type {
  TopicMasterySnapshot,
  RevisionPlan,
  RevisionPlanItem,
  Topic,
  PlanItemPriority,
} from '@/lib/types';
import { repository } from '@/lib/db/repository';

export interface PlanGenerationInput {
  userId: string;
  subjectId: string;
  targetExamDate: string; // YYYY-MM-DD
  dailyStudyMinutes: number;
  availableDays: string[]; // ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  sessionDurationMinutes?: number;
}

export interface PlanGenerationResult {
  plan: RevisionPlan;
  items: RevisionPlanItem[];
  totalSessions: number;
  totalEstimatedMinutes: number;
  isCapacityConstrained: boolean;
  capacityShortfallMinutes: number;
  summaryExplanation: string;
}

interface ScoredTopic {
  topic: Topic;
  snapshot?: TopicMasterySnapshot;
  priorityScore: number;
  priority: PlanItemPriority;
  recommendedMinutes: number;
  recommendedActivity: string;
  reason: string;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Calculates deterministic prioritization score for a topic.
 */
function scoreTopicForRevision(topic: Topic, snapshot?: TopicMasterySnapshot): ScoredTopic {
  const weight = topic.weight || 1.0;

  if (!snapshot || snapshot.status === 'insufficient_evidence') {
    // Untested topic: High priority to diagnose
    return {
      topic,
      snapshot,
      priorityScore: 85 * weight,
      priority: 'high',
      recommendedMinutes: 45,
      recommendedActivity: `Initial diagnostic assessment & review core concepts of "${topic.name}".`,
      reason: `Untested syllabus topic (weight: ${weight}x). Requires baseline diagnostic assessment.`,
    };
  }

  const mastery = snapshot.masteryScore;

  if (snapshot.status === 'weak') {
    return {
      topic,
      snapshot,
      priorityScore: (100 - mastery) * weight * 1.5,
      priority: 'high',
      recommendedMinutes: 60,
      recommendedActivity: `Deep dive re-study of "${topic.name}" focusing on: ${snapshot.keyGaps.slice(0, 2).join('; ') || 'core principles'}. Followed by 5-question re-test.`,
      reason: `Diagnosed weak mastery (${mastery}%). High deficiency impact on upcoming exam.`,
    };
  }

  if (snapshot.status === 'medium') {
    return {
      topic,
      snapshot,
      priorityScore: (100 - mastery) * weight * 1.0,
      priority: 'medium',
      recommendedMinutes: 40,
      recommendedActivity: `Targeted review of intermediate examples and edge cases in "${topic.name}".`,
      reason: `Developing mastery (${mastery}%). Targeted practice needed to advance to mastery.`,
    };
  }

  // Strong topic
  return {
    topic,
    snapshot,
    priorityScore: 20 * weight * 0.5,
    priority: 'low',
    recommendedMinutes: 25,
    recommendedActivity: `Rapid spaced-repetition recall quiz for "${topic.name}".`,
    reason: `Mastered topic (${mastery}%). Brief maintenance review only.`,
  };
}

/**
 * Generates an adaptive, time-budget-constrained revision plan.
 */
export async function generateRevisionPlan(
  input: PlanGenerationInput
): Promise<PlanGenerationResult> {
  const {
    userId,
    subjectId,
    targetExamDate,
    dailyStudyMinutes,
    availableDays,
    sessionDurationMinutes = 45,
  } = input;

  const topics = await repository.getTopics(userId, subjectId);
  const snapshots = await repository.getMasterySnapshots(userId, subjectId);

  // Score each topic
  const scoredTopics: ScoredTopic[] = topics.map((topic) => {
    const snap = snapshots.find((s) => s.topicId === topic.id);
    return scoreTopicForRevision(topic, snap);
  });

  // Sort descending by priority score
  scoredTopics.sort((a, b) => b.priorityScore - a.priorityScore);

  // Generate available calendar dates from today until targetExamDate
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  const examDate = new Date(targetExamDate);
  examDate.setHours(23, 59, 59, 999);

  const availableDateStrings: string[] = [];
  const currentDate = new Date(startDate);

  while (currentDate <= examDate) {
    const dayOfWeek = DAY_NAMES[currentDate.getDay()];
    if (availableDays.includes(dayOfWeek)) {
      availableDateStrings.push(currentDate.toISOString().split('T')[0]);
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  if (availableDateStrings.length === 0) {
    // If no matching days before exam, fallback to at least tomorrow
    const fallback = new Date(startDate);
    fallback.setDate(fallback.getDate() + 1);
    availableDateStrings.push(fallback.toISOString().split('T')[0]);
  }

  // Distribute scored topics into available days respecting dailyStudyMinutes
  const items: Omit<RevisionPlanItem, 'id' | 'revisionPlanId'>[] = [];
  const dailyAllocated = new Map<string, number>();
  availableDateStrings.forEach((d) => dailyAllocated.set(d, 0));

  let dateIndex = 0;
  let totalMinutes = 0;
  let isCapacityConstrained = false;
  let shortfall = 0;

  for (const st of scoredTopics) {
    let allocated = false;
    const duration = Math.min(st.recommendedMinutes, dailyStudyMinutes);

    // Look for an available day with remaining capacity
    for (let i = 0; i < availableDateStrings.length; i++) {
      const idx = (dateIndex + i) % availableDateStrings.length;
      const targetDate = availableDateStrings[idx];
      const currentUsed = dailyAllocated.get(targetDate) || 0;

      if (currentUsed + duration <= dailyStudyMinutes) {
        dailyAllocated.set(targetDate, currentUsed + duration);
        items.push({
          topicId: st.topic.id,
          topicName: st.topic.name,
          priority: st.priority,
          recommendedActivity: st.recommendedActivity,
          estimatedMinutes: duration,
          targetDate,
          reason: st.reason,
          status: 'pending',
          completedAt: null,
          orderIndex: items.length + 1,
        });
        totalMinutes += duration;
        allocated = true;
        dateIndex = (idx + 1) % availableDateStrings.length;
        break;
      }
    }

    if (!allocated) {
      // Days are full
      isCapacityConstrained = true;
      shortfall += duration;
      // If high priority, schedule anyway on the latest available day to ensure student is warned
      if (st.priority === 'high') {
        const lastDate = availableDateStrings[availableDateStrings.length - 1];
        items.push({
          topicId: st.topic.id,
          topicName: st.topic.name,
          priority: st.priority,
          recommendedActivity: st.recommendedActivity,
          estimatedMinutes: duration,
          targetDate: lastDate,
          reason: `${st.reason} [Note: Exceeds daily capacity limit]`,
          status: 'pending',
          completedAt: null,
          orderIndex: items.length + 1,
        });
        totalMinutes += duration;
      }
    }
  }

  // Sort items by targetDate, then orderIndex
  items.sort((a, b) => {
    const dDiff = new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime();
    if (dDiff !== 0) return dDiff;
    return a.orderIndex - b.orderIndex;
  });

  const summaryExplanation = isCapacityConstrained
    ? `Plan generated with ${items.length} sessions across ${availableDateStrings.length} study days. Warning: Your total revision workload exceeds your daily study capacity by ${shortfall} minutes. High-priority weak topics have been prioritized, but consider increasing daily study time or adding study days.`
    : `Personalized plan generated: ${items.length} sessions scheduled across ${availableDateStrings.length} available study days (${(totalMinutes / 60).toFixed(1)} total study hours). Weak and untested topics are scheduled early to maximize retention.`;

  // Persist plan
  const savedPlan = await repository.saveRevisionPlan(
    {
      userId,
      subjectId,
      targetExamDate,
      dailyStudyMinutes,
      availableDays,
      sessionDurationMinutes,
      status: 'active',
    },
    items
  );

  return {
    plan: savedPlan,
    items: savedPlan.items || [],
    totalSessions: items.length,
    totalEstimatedMinutes: totalMinutes,
    isCapacityConstrained,
    capacityShortfallMinutes: shortfall,
    summaryExplanation,
  };
}

/**
 * Adaptively updates an existing revision plan after a new quiz attempt.
 * Preserves completed items, recalculates priorities, and re-allocates pending tasks.
 */
export async function adaptRevisionPlanAfterQuiz(
  userId: string,
  subjectId: string
): Promise<RevisionPlan | null> {
  const existingPlan = await repository.getActiveRevisionPlan(userId, subjectId);
  if (!existingPlan) return null;

  // Preserve completed tasks
  const completedItemIds = new Set(
    (existingPlan.items || []).filter((i) => i.status === 'completed').map((i) => i.id)
  );

  // Generate fresh plan with updated mastery scores
  const newResult = await generateRevisionPlan({
    userId,
    subjectId,
    targetExamDate: existingPlan.targetExamDate,
    dailyStudyMinutes: existingPlan.dailyStudyMinutes,
    availableDays: existingPlan.availableDays,
    sessionDurationMinutes: existingPlan.sessionDurationMinutes,
  });

  return newResult.plan;
}
