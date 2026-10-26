import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import { repository } from '@/lib/db/repository';

const TopicSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  level: z.number().int().min(1).max(3),
  parentId: z.string().nullable().optional(),
  description: z.string().optional(),
  weight: z.number().default(1.0),
  orderIndex: z.number().int().default(0),
});

const SaveTopicsSchema = z.object({
  topics: z.array(TopicSchema),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;
  const topics = await repository.getTopics(auth.user.id, id);
  return NextResponse.json({ topics });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;
  const subject = await repository.getSubjectById(auth.user.id, id);
  if (!subject) {
    return NextResponse.json({ error: 'Subject not found or unauthorized' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const parsed = SaveTopicsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid topic structure', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const saved = await repository.saveTopics(auth.user.id, id, parsed.data.topics);
    return NextResponse.json({ topics: saved }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
