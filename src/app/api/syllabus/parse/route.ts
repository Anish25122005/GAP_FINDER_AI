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
        return NextResponse.json({ error: 'No file uploaded. Please select a file.' }, { status: 400 });
      }

      const filename = file.name || 'syllabus';
      const isPdf = filename.toLowerCase().endsWith('.pdf');
      const isTxt = filename.toLowerCase().endsWith('.txt') || file.type.includes('text');

      if (!isPdf && !isTxt) {
        return NextResponse.json(
          { error: 'Unsupported file format. Please upload a PDF (.pdf) or Plain Text (.txt) file.' },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      if (isPdf) {
        const ext = await extractTextFromPdf(buffer);
        syllabusText = ext.text;
      } else {
        const ext = extractTextFromTxt(buffer);
        syllabusText = ext.text;
      }
    } else {
      let body: any = {};
      try {
        const rawBody = await req.text();
        body = rawBody && rawBody.trim() ? JSON.parse(rawBody) : {};
      } catch {
        return NextResponse.json(
          { error: 'Invalid JSON request body. Expected { text, subjectId }.' },
          { status: 400 }
        );
      }
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

    return NextResponse.json(
      {
        units,
        objectives,
        flattened,
        extractedCharacterCount: syllabusText.length,
      },
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    console.error('Syllabus parsing route error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to parse syllabus outline.' },
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
