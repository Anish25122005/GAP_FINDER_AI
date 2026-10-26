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
  const doc = await repository.getDocumentById(auth.user.id, id);
  if (!doc) {
    return NextResponse.json({ error: 'Document not found or unauthorized' }, { status: 404 });
  }

  const chunks = await repository.getChunksByDocumentId(auth.user.id, id);
  return NextResponse.json({ document: doc, chunks });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;
  const deleted = await repository.deleteDocument(auth.user.id, id);
  if (!deleted) {
    return NextResponse.json({ error: 'Document not found or unauthorized' }, { status: 404 });
  }

  return NextResponse.json({ message: 'Document and indexed chunks deleted successfully' });
}
