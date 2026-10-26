import { aiProvider, sanitizeUntrustedContent } from './provider';
import { generateEmbedding } from './embeddings';
import { repository } from '@/lib/db/repository';
import type { CitationMetadata, ChatMessage } from '@/lib/types';

export interface AssistantResponse {
  content: string;
  citations: CitationMetadata[];
  isGrounded: boolean;
  retrievedCount: number;
}

/**
 * Answers questions strictly grounded in the student's uploaded learning material.
 */
export async function askTopicAssistant(
  userId: string,
  subjectId: string,
  userQuestion: string,
  topicId?: string
): Promise<AssistantResponse> {
  const sanitizedQuery = sanitizeUntrustedContent(userQuestion.trim());

  // 1. Vector Retrieval
  const queryEmb = await generateEmbedding(sanitizedQuery);
  const similarChunks = await repository.searchSimilarChunks(userId, queryEmb, {
    subjectId,
    limit: 4,
    threshold: 0.2,
  });

  // 2. Check for empty retrieval
  if (similarChunks.length === 0) {
    return {
      content:
        'I searched your uploaded learning material for this subject, but found no relevant notes or sections addressing your question. Please ensure you have uploaded documents covering this topic in the Document Library.',
      citations: [],
      isGrounded: false,
      retrievedCount: 0,
    };
  }

  // 3. Prepare retrieved context and citations
  const citations: CitationMetadata[] = similarChunks.map((c) => ({
    documentId: c.documentId,
    documentTitle: c.sectionTitle || 'Document Material',
    chunkId: c.id,
    pageNumber: c.pageNumber ?? null,
    sectionTitle: c.sectionTitle ?? null,
    excerpt: c.content.slice(0, 160).trim(),
  }));

  const contextText = similarChunks
    .map(
      (c, idx) =>
        `[Source ${idx + 1} | Section: ${c.sectionTitle || 'General'} | Page: ${c.pageNumber || 'N/A'}]\n${c.content}`
    )
    .join('\n\n---\n\n');

  const prompt = `
You are GapFinder AI's Topic Assistant. Your job is to explain concepts strictly and defensibly based on the student's uploaded learning material.

Student's Question:
<<<UNTRUSTED_STUDENT_QUERY>>>
${sanitizedQuery}
<<<UNTRUSTED_STUDENT_QUERY>>>

Retrieved Course Notes:
<<<UNTRUSTED_RETRIEVED_CONTEXT>>>
${sanitizeUntrustedContent(contextText)}
<<<UNTRUSTED_RETRIEVED_CONTEXT>>>

Strict Grounding Rules:
1. Base your explanation ONLY on the facts stated directly in the retrieved course notes above.
2. If the notes do NOT contain enough information to fully answer the question, explicitly state: "Your uploaded material does not contain sufficient details to answer this completely." Then summarize what little is available.
3. NEVER make up external facts or claim they came from the student's notes.
4. Reference the source sections (e.g., "[Section Name, Page X]") when citing key definitions.
5. Provide a clear, structured educational explanation.
`;

  try {
    const responseText = await aiProvider.generateText([
      {
        role: 'system',
        content:
          'You are a strictly grounded educational assistant. Answer ONLY based on provided context.',
      },
      { role: 'user', content: prompt },
    ]);

    return {
      content: responseText,
      citations,
      isGrounded: true,
      retrievedCount: similarChunks.length,
    };
  } catch (err: any) {
    // Fallback: construct answer directly from top retrieved chunk
    const topChunk = similarChunks[0];
    return {
      content: `Based directly on your uploaded notes (${topChunk.sectionTitle || 'Course Notes'}):\n\n${topChunk.content.slice(0, 400)}...`,
      citations,
      isGrounded: true,
      retrievedCount: similarChunks.length,
    };
  }
}
