import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { repository } from '@/lib/db/repository';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;
  const attempt = await repository.getAttemptById(auth.user.id, id);

  if (!attempt) {
    return NextResponse.json({ error: 'Attempt not found or unauthorized' }, { status: 404 });
  }

  return NextResponse.json({ attempt });
}
