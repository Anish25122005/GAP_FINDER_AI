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
  const subject = await repository.getSubjectById(auth.user.id, id);

  if (!subject) {
    return NextResponse.json({ error: 'Subject not found or unauthorized' }, { status: 404 });
  }

  const topics = await repository.getTopics(auth.user.id, id);
  const documents = await repository.getDocuments(auth.user.id, id);

  return NextResponse.json({ subject, topics, documents });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;
  const deleted = await repository.deleteSubject(auth.user.id, id);

  if (!deleted) {
    return NextResponse.json({ error: 'Subject not found or unauthorized' }, { status: 404 });
  }

  return NextResponse.json({ message: 'Subject deleted successfully' });
}
