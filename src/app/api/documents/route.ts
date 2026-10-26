import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { repository } from '@/lib/db/repository';
import { extractTextFromPdf, extractTextFromTxt } from '@/lib/ai/text-extractor';
import { chunkExtractedDocument } from '@/lib/ai/chunker';
import { generateEmbeddings } from '@/lib/ai/embeddings';
import { mapChunksToTopics } from '@/lib/ai/topic-mapper';
import type { DocumentRecord } from '@/lib/types';

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_BYTES || '15728640', 10); // 15MB

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.errorResponse) return auth.errorResponse;

  const url = new URL(req.url);
  const subjectId = url.searchParams.get('subjectId') || undefined;

  const documents = await repository.getDocuments(auth.user.id, subjectId);
  return NextResponse.json({ documents });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const subjectId = (formData.get('subjectId') as string) || null;
    const title = (formData.get('title') as string) || file?.name || 'Untitled Document';

    if (!file) {
      return NextResponse.json({ error: 'No file provided for upload.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds the 15MB limit. Uploaded size: ${(file.size / 1024 / 1024).toFixed(1)}MB.` },
        { status: 400 }
      );
    }

    const filename = file.name;
    const isPdf = filename.toLowerCase().endsWith('.pdf');
    const isTxt = filename.toLowerCase().endsWith('.txt') || file.type.includes('text');

    if (!isPdf && !isTxt) {
      return NextResponse.json(
        { error: 'Unsupported file format. Please upload a PDF (.pdf) or Plain Text (.txt) file.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // 1. Extract Text
    let extraction;
    try {
      if (isPdf) {
        extraction = await extractTextFromPdf(buffer);
      } else {
        extraction = extractTextFromTxt(buffer);
      }
    } catch (extErr: any) {
      return NextResponse.json({ error: extErr.message || 'Failed to extract text from document.' }, { status: 400 });
    }

    // 2. Create Document Record
    let createdDocId: string | null = null;
    try {
      const docRecord = await repository.createDocument(auth.user.id, {
        subjectId,
        title,
        filename,
        fileType: isPdf ? 'pdf' : 'txt',
        fileSize: file.size,
        status: 'processing',
      });
      createdDocId = docRecord.id;

      // 3. Chunk Document
      const chunks = chunkExtractedDocument(extraction);

      // 4. Generate Embeddings
      const chunkTexts = chunks.map((c) => `${c.sectionTitle || ''}: ${c.content}`);
      const embeddings = await generateEmbeddings(chunkTexts);

      // 5. Save Chunks
      const chunkRecords = chunks.map((c, idx) => ({
        documentId: docRecord.id,
        userId: auth.user.id,
        subjectId,
        chunkIndex: c.chunkIndex,
        pageNumber: c.pageNumber,
        sectionTitle: c.sectionTitle,
        content: c.content,
        tokenCount: c.tokenCount,
        embedding: embeddings[idx],
      }));

      const savedChunks = await repository.saveChunks(chunkRecords);

      // 6. Map to topics if subject has topics
      if (subjectId) {
        const topics = await repository.getTopics(auth.user.id, subjectId);
        if (topics.length > 0) {
          await mapChunksToTopics(topics, savedChunks, 0.25);
        }
      }

      const updatedDoc = await repository.getDocumentById(auth.user.id, docRecord.id);

      return NextResponse.json(
        {
          document: updatedDoc,
          chunkCount: savedChunks.length,
          message: 'Document successfully processed and indexed into vector store.',
        },
        { status: 201 }
      );
    } catch (procErr: any) {
      if (createdDocId) {
        await repository.updateDocument(auth.user.id, createdDocId, {
          status: 'failed',
          errorMessage: procErr.message || 'Processing and vector indexing failed',
        });
      }
      throw procErr;
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'An unexpected error occurred during document processing.' },
      { status: 500 }
    );
  }
}
