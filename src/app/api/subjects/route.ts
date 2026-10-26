import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import { repository } from '@/lib/db/repository';

const CreateSubjectSchema = z.object({
  name: z.string().min(2, 'Subject name must be at least 2 characters'),
  code: z.string().optional(),
  description: z.string().optional(),
});

export async function GET() {
  const auth = await requireAuth();
  if (auth.errorResponse) return auth.errorResponse;

  const subjects = await repository.getSubjects(auth.user.id);
  return NextResponse.json({ subjects });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    const parsed = CreateSubjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const subject = await repository.createSubject(auth.user.id, parsed.data);
    return NextResponse.json({ subject }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
