import type {
  TopicMasterySnapshot,
  MasteryStatus,
  StudentAnswerWithEvaluation,
  Topic,
} from '@/lib/types';
import { repository } from '@/lib/db/repository';

export interface GapAnalysisConfig {
  weakThreshold: number; // default: 50.0%
  strongThreshold: number; // default: 75.0%
  minEvidenceQuestions: number; // default: 2 questions
}

export const DEFAULT_GAP_CONFIG: GapAnalysisConfig = {
  weakThreshold: 50.0,
  strongThreshold: 75.0,
  minEvidenceQuestions: 2,
};

export interface TopicPerformanceEvidence {
  topicId: string;
  topicName: string;
  masteryScore: number;
  status: MasteryStatus;
  questionsAttempted: number;
  correctCount: number;
  partiallyCorrectCount: number;
  incorrectCount: number;
  confidence: number;
  keyGaps: string[];
  explanation: string;
  recommendation: string;
}

/**
 * Calculates difficulty multiplier:
 * hard: 1.2, medium: 1.0, easy: 0.8
 */
function getDifficultyMultiplier(difficulty?: string): number {
  switch (difficulty) {
    case 'hard':
      return 1.2;
    case 'easy':
      return 0.8;
    case 'medium':
    default:
      return 1.0;
  }
}

/**
 * Deterministically analyzes student answers for a specific topic and computes
 * the evidence-grounded mastery estimate and classification.
 */
export function calculateTopicMastery(
  topic: Topic,
  answers: StudentAnswerWithEvaluation[],
  config: GapAnalysisConfig = DEFAULT_GAP_CONFIG
): TopicPerformanceEvidence {
  const topicAnswers = answers.filter((a) => a.question && a.question.topicId === topic.id);
  const attempted = topicAnswers.length;

  if (attempted === 0) {
    return {
      topicId: topic.id,
      topicName: topic.name,
      masteryScore: 0.0,
      status: 'insufficient_evidence',
      questionsAttempted: 0,
      correctCount: 0,
      partiallyCorrectCount: 0,
      incorrectCount: 0,
      confidence: 0.0,
      keyGaps: ['Topic has not been assessed yet.'],
      explanation: 'No diagnostic questions have been completed for this topic.',
      recommendation: 'Take a diagnostic quiz covering this topic to evaluate your baseline mastery.',
    };
  }

  let totalWeightedScore = 0;
  let totalWeight = 0;
  let correctCount = 0;
  let partiallyCorrectCount = 0;
  let incorrectCount = 0;
  const missedConceptsSet = new Set<string>();

  // Process answers (most recent first)
  const sorted = [...topicAnswers].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  sorted.forEach((item, index) => {
    const diff = getDifficultyMultiplier(item.question?.difficulty);
    // Slight recency weight: 1.0 for most recent, 0.95^index for older
    const recency = Math.pow(0.95, index);
    const weight = diff * recency;

    const evalResult = item.evaluation;
    const score = evalResult ? evalResult.score : 0.0;

    totalWeightedScore += score * weight;
    totalWeight += weight;

    if (evalResult?.correctness === 'correct') {
      correctCount++;
    } else if (evalResult?.correctness === 'partially_correct') {
      partiallyCorrectCount++;
      evalResult.missingConcepts?.forEach((c) => missedConceptsSet.add(c));
    } else {
      incorrectCount++;
      evalResult?.missingConcepts?.forEach((c) => missedConceptsSet.add(c));
    }
  });

  const rawMasteryPercent = totalWeight > 0 ? (totalWeightedScore / totalWeight) * 100 : 0.0;
  const masteryScore = parseFloat(Math.min(100.0, Math.max(0.0, rawMasteryPercent)).toFixed(1));

  // Evidence sufficiency confidence
  // Scales up with number of questions attempted (e.g. 5 questions = 1.0 confidence)
  const evidenceSufficiency = Math.min(1.0, attempted / 5);
  const confidence = parseFloat(evidenceSufficiency.toFixed(2));

  // Mastery classification
  let status: MasteryStatus;
  if (attempted < config.minEvidenceQuestions) {
    status = 'insufficient_evidence';
  } else if (masteryScore >= config.strongThreshold) {
    status = 'strong';
  } else if (masteryScore >= config.weakThreshold) {
    status = 'medium';
  } else {
    status = 'weak';
  }

  const keyGaps = Array.from(missedConceptsSet);
  if (keyGaps.length === 0 && incorrectCount > 0) {
    keyGaps.push(`Errors on ${incorrectCount} question(s) involving core principles.`);
  }

  // Construct transparent evidence explanation
  let explanation = '';
  let recommendation = '';

  if (status === 'insufficient_evidence') {
    explanation = `Assessed with only ${attempted} question(s). A minimum of ${config.minEvidenceQuestions} questions is required to establish a reliable mastery diagnosis. Current observed performance is ${masteryScore}%.`;
    recommendation = `Complete at least ${config.minEvidenceQuestions - attempted} more question(s) to verify your understanding.`;
  } else if (status === 'weak') {
    explanation = `Demonstrated weak mastery (${masteryScore}%) across ${attempted} attempted questions (${correctCount} correct, ${partiallyCorrectCount} partial, ${incorrectCount} incorrect). Significant knowledge gaps identified: ${keyGaps.slice(0, 3).join(', ') || 'fundamental definitions'}.`;
    recommendation = `Prioritize high-intensity revision of "${topic.name}". Re-read the cited source sections and take a focused follow-up quiz.`;
  } else if (status === 'medium') {
    explanation = `Demonstrated developing mastery (${masteryScore}%) across ${attempted} attempted questions. Core principles are understood, but specific concepts require refinement: ${keyGaps.slice(0, 2).join(', ') || 'edge cases'}.`;
    recommendation = `Review targeted lecture notes and practice intermediate questions on "${topic.name}".`;
  } else {
    explanation = `Demonstrated strong mastery (${masteryScore}%) across ${attempted} attempted questions (${correctCount} correct). Strong grasp of foundational and applied principles.`;
    recommendation = `Maintain mastery with periodic spaced repetition. Focus study time on weaker syllabus topics.`;
  }

  return {
    topicId: topic.id,
    topicName: topic.name,
    masteryScore,
    status,
    questionsAttempted: attempted,
    correctCount,
    partiallyCorrectCount,
    incorrectCount,
    confidence,
    keyGaps,
    explanation,
    recommendation,
  };
}

/**
 * Recomputes and persists topic mastery snapshots for all topics in a subject.
 */
export async function recomputeSubjectMastery(
  userId: string,
  subjectId: string,
  config: GapAnalysisConfig = DEFAULT_GAP_CONFIG
): Promise<TopicMasterySnapshot[]> {
  const topics = await repository.getTopics(userId, subjectId);
  const attempts = await repository.getAttemptsBySubject(userId, subjectId);

  // Collect all student answers across completed attempts
  const allAnswers: StudentAnswerWithEvaluation[] = [];
  for (const att of attempts) {
    const fullAttempt = await repository.getAttemptById(userId, att.id);
    if (fullAttempt?.answers) {
      allAnswers.push(...fullAttempt.answers);
    }
  }

  const updatedSnapshots: TopicMasterySnapshot[] = [];

  for (const topic of topics) {
    const evidence = calculateTopicMastery(topic, allAnswers, config);

    const snapshot = await repository.saveMasterySnapshot({
      userId,
      subjectId,
      topicId: topic.id,
      topicName: topic.name,
      masteryScore: evidence.masteryScore,
      status: evidence.status,
      questionsAttempted: evidence.questionsAttempted,
      correctCount: evidence.correctCount,
      incorrectCount: evidence.incorrectCount,
      confidence: evidence.confidence,
      keyGaps: evidence.keyGaps,
      lastAssessmentAt: new Date().toISOString(),
    });

    updatedSnapshots.push(snapshot);
  }

  return updatedSnapshots;
}
