import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import { parseSyllabus, parseSyllabusWithMetadata, flattenTopicTree } from '@/lib/ai/syllabus-parser';
import { extractTextFromPdf, extractTextFromTxt } from '@/lib/ai/text-extractor';

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const contentType = req.headers.get('content-type') || '';
    let syllabusText = '';
    let subjectId = '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      subjectId = (formData.get('subjectId') as string) || '';

      if (!file) {
        return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const ext = await extractTextFromPdf(buffer);
        syllabusText = ext.text;
      } else {
        const ext = extractTextFromTxt(buffer);
        syllabusText = ext.text;
      }
    } else {
      const body = await req.json();
      syllabusText = body.text || '';
      subjectId = body.subjectId || '';
    }

    if (!syllabusText || syllabusText.trim().length < 15) {
      return NextResponse.json(
        { error: 'Syllabus content is too short or unreadable. Please provide sufficient course outline text.' },
        { status: 400 }
      );
    }

    const { units, objectives } = await parseSyllabusWithMetadata(syllabusText);
    const flattened = flattenTopicTree(units, subjectId, auth.user.id);

    return NextResponse.json({
      units,
      objectives,
      flattened,
      extractedCharacterCount: syllabusText.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to parse syllabus' }, { status: 500 });
  }
}
