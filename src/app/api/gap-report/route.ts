import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { repository } from '@/lib/db/repository';
import { recomputeSubjectMastery } from '@/lib/ai/gap-analyzer';

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.errorResponse) return auth.errorResponse;

  const url = new URL(req.url);
  const subjectId = url.searchParams.get('subjectId');
  const refresh = url.searchParams.get('refresh') === 'true';

  if (!subjectId) {
    return NextResponse.json({ error: 'subjectId parameter is required' }, { status: 400 });
  }

  const subject = await repository.getSubjectById(auth.user.id, subjectId);
  if (!subject) {
    return NextResponse.json({ error: 'Subject not found or unauthorized' }, { status: 404 });
  }

  let snapshots = await repository.getMasterySnapshots(auth.user.id, subjectId);

  // If no snapshots exist or refresh requested, compute now
  if (snapshots.length === 0 || refresh) {
    snapshots = await recomputeSubjectMastery(auth.user.id, subjectId);
  }

  const totalTopics = snapshots.length;
  let assessedTopics = 0;
  let weakCount = 0;
  let mediumCount = 0;
  let strongCount = 0;
  let insufficientEvidenceCount = 0;
  let totalScoreSum = 0;

  for (const s of snapshots) {
    if (s.questionsAttempted > 0) {
      assessedTopics++;
      totalScoreSum += s.masteryScore;
    }

    if (s.status === 'weak') weakCount++;
    else if (s.status === 'medium') mediumCount++;
    else if (s.status === 'strong') strongCount++;
    else insufficientEvidenceCount++;
  }

  const overallMastery = assessedTopics > 0 ? parseFloat((totalScoreSum / assessedTopics).toFixed(1)) : 0;

  return NextResponse.json({
    summary: {
      subjectId,
      subjectName: subject.name,
      totalTopics,
      assessedTopics,
      weakCount,
      mediumCount,
      strongCount,
      insufficientEvidenceCount,
      overallMastery,
      topicSnapshots: snapshots,
    },
  });
}
