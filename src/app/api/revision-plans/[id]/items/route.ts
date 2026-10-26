import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import { repository } from '@/lib/db/repository';

const UpdateItemSchema = z.object({
  itemId: z.string().min(1),
  status: z.enum(['pending', 'completed', 'skipped']),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    const parsed = UpdateItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid update payload', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { itemId, status } = parsed.data;
    const updated = await repository.updateRevisionPlanItemStatus(auth.user.id, itemId, status);

    if (!updated) {
      return NextResponse.json({ error: 'Item not found or unauthorized' }, { status: 404 });
    }

    return NextResponse.json({ item: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
