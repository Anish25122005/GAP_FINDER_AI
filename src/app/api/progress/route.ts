import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { repository } from '@/lib/db/repository';

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.errorResponse) return auth.errorResponse;

  const url = new URL(req.url);
  const subjectId = url.searchParams.get('subjectId') || undefined;

  const subjects = await repository.getSubjects(auth.user.id);
  const selectedSubjectId = subjectId || (subjects.length > 0 ? subjects[0].id : null);

  const documents = await repository.getDocuments(auth.user.id, selectedSubjectId || undefined);

  let topics: any[] = [];
  let masterySnapshots: any[] = [];
  let attempts: any[] = [];
  let activePlan: any = null;

  if (selectedSubjectId) {
    topics = await repository.getTopics(auth.user.id, selectedSubjectId);
    masterySnapshots = await repository.getMasterySnapshots(auth.user.id, selectedSubjectId);
    attempts = await repository.getAttemptsBySubject(auth.user.id, selectedSubjectId);
    activePlan = await repository.getActiveRevisionPlan(auth.user.id, selectedSubjectId);
  }

  // Mastery breakdown
  let weakCount = 0;
  let mediumCount = 0;
  let strongCount = 0;
  let insufficientCount = 0;
  let totalScoreSum = 0;
  let assessedTopicsCount = 0;

  masterySnapshots.forEach((s) => {
    if (s.questionsAttempted > 0) {
      assessedTopicsCount++;
      totalScoreSum += s.masteryScore;
    }
    if (s.status === 'weak') weakCount++;
    else if (s.status === 'medium') mediumCount++;
    else if (s.status === 'strong') strongCount++;
    else insufficientCount++;
  });

  // Calculate trends across attempts
  const completedAttempts = attempts
    .filter((a) => a.status === 'completed')
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

  const historicalTrends = completedAttempts.map((a, idx) => ({
    attemptNumber: idx + 1,
    attemptId: a.id,
    date: a.completedAt || a.startedAt,
    score: a.totalScore,
    maxScore: a.maxScore,
    percentage: a.percentage,
  }));

  // Identify topics requiring urgent attention
  const weakTopics = masterySnapshots
    .filter((s) => s.status === 'weak')
    .sort((a, b) => a.masteryScore - b.masteryScore);

  // Identify topics mastered
  const masteredTopics = masterySnapshots
    .filter((s) => s.status === 'strong')
    .sort((a, b) => b.masteryScore - a.masteryScore);

  // Revision plan completion rate
  let planStats = null;
  if (activePlan && activePlan.items) {
    const totalItems = activePlan.items.length;
    const completedItems = activePlan.items.filter((i: any) => i.status === 'completed').length;
    planStats = {
      planId: activePlan.id,
      targetExamDate: activePlan.targetExamDate,
      totalItems,
      completedItems,
      completionRate: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
    };
  }

  return NextResponse.json({
    selectedSubjectId,
    subjects,
    metrics: {
      totalSubjects: subjects.length,
      totalDocuments: documents.length,
      totalTopics: topics.length,
      assessedTopics: assessedTopicsCount,
      completedAttemptsCount: completedAttempts.length,
      overallMastery: assessedTopicsCount > 0 ? parseFloat((totalScoreSum / assessedTopicsCount).toFixed(1)) : 0,
      distribution: {
        weak: weakCount,
        medium: mediumCount,
        strong: strongCount,
        insufficientEvidence: insufficientCount,
      },
    },
    historicalTrends,
    weakTopics,
    masteredTopics,
    planStats,
    recentAttempts: attempts.slice(0, 5),
  });
}
