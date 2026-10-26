import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import { repository } from '@/lib/db/repository';
import { generateRevisionPlan } from '@/lib/ai/revision-planner';

const CreatePlanSchema = z.object({
  subjectId: z.string().min(1),
  targetExamDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Target date must be in YYYY-MM-DD format'),
  dailyStudyMinutes: z.number().int().min(15).max(480).default(60),
  availableDays: z.array(z.string()).min(1, 'Select at least one day per week for revision'),
  sessionDurationMinutes: z.number().int().min(15).max(120).default(45),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.errorResponse) return auth.errorResponse;

  const url = new URL(req.url);
  const subjectId = url.searchParams.get('subjectId');

  if (!subjectId) {
    return NextResponse.json({ error: 'subjectId parameter is required' }, { status: 400 });
  }

  const plan = await repository.getActiveRevisionPlan(auth.user.id, subjectId);
  return NextResponse.json({ plan });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    const parsed = CreatePlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid plan configuration', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { subjectId, targetExamDate, dailyStudyMinutes, availableDays, sessionDurationMinutes } = parsed.data;

    const subject = await repository.getSubjectById(auth.user.id, subjectId);
    if (!subject) {
      return NextResponse.json({ error: 'Subject not found or unauthorized' }, { status: 404 });
    }

    const result = await generateRevisionPlan({
      userId: auth.user.id,
      subjectId,
      targetExamDate,
      dailyStudyMinutes,
      availableDays,
      sessionDurationMinutes,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Plan generation failed' }, { status: 500 });
  }
}
