import { aiProvider, sanitizeUntrustedContent } from './provider';
import { generateEmbedding } from './embeddings';
import { repository } from '@/lib/db/repository';
import type { CitationMetadata, ChatMessage, DocumentChunk } from '@/lib/types';

export interface AssistantResponse {
  content: string;
  citations: CitationMetadata[];
  isGrounded: boolean;
  retrievedCount: number;
}

const STOP_WORDS = new Set([
  'what', 'when', 'where', 'which', 'who', 'whom', 'whose', 'why', 'how',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could', 'will', 'would',
  'shall', 'should', 'may', 'might', 'must', 'and', 'or', 'but', 'if', 'because',
  'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with', 'about', 'against',
  'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again',
  'further', 'then', 'once', 'here', 'there', 'all', 'any', 'both', 'each',
  'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
  'own', 'same', 'so', 'than', 'too', 'very', 'tell', 'explain', 'describe',
  'according', 'notes', 'material', 'course', 'overview', 'definition'
]);

/**
 * Computes a simple keyword overlap score between a query and a chunk,
 * ignoring common stop words to prevent false-positive matches on function words.
 */
function keywordOverlapScore(query: string, chunkContent: string): number {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  const queryWords = normalize(query);
  if (queryWords.length === 0) return 0;
  const chunkText = chunkContent.toLowerCase();
  let matched = 0;
  for (const word of queryWords) {
    if (chunkText.includes(word)) matched++;
  }
  return matched / queryWords.length;
}

/**
 * Answers questions strictly grounded in the student's uploaded learning material.
 * Uses hybrid retrieval: vector cosine similarity + lexical keyword overlap.
 */
export async function askTopicAssistant(
  userId: string,
  subjectId: string,
  userQuestion: string,
  topicId?: string
): Promise<AssistantResponse> {
  const sanitizedQuery = sanitizeUntrustedContent(userQuestion.trim());

  // 1. Vector Retrieval with low initial threshold
  const queryEmb = await generateEmbedding(sanitizedQuery);
  const rawSimilarChunks = await repository.searchSimilarChunks(userId, queryEmb, {
    subjectId,
    limit: 8,
    threshold: 0.01,
  });

  // 2. Candidate collection: combine vector matches or fallback to subject chunks
  let candidates = rawSimilarChunks;
  if (candidates.length === 0) {
    const subjectChunks = await repository.getChunksBySubjectId(userId, subjectId);
    candidates = subjectChunks.map((c) => ({ ...c, similarity: 0.01 }));
  }

  // 3. Strict confidence gating: reject chunks without meaningful keyword overlap or vector similarity
  const scoredChunks = candidates
    .map((chunk) => {
      const kwScore = keywordOverlapScore(sanitizedQuery, chunk.content);
      const hybridScore = chunk.similarity * 0.4 + kwScore * 0.6;
      return { ...chunk, similarity: hybridScore, kwScore };
    })
    .filter((chunk) => {
      // Must have either meaningful content keyword overlap (>= 0.20) or solid vector similarity (>= 0.035)
      return chunk.kwScore >= 0.20 || (chunk.kwScore > 0 && chunk.similarity >= 0.035) || chunk.similarity >= 0.055;
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 4);

  // 4. Reject if no chunks pass the relevance confidence gate
  if (scoredChunks.length === 0) {
    return {
      content:
        `Based on your uploaded learning material and course notes, I could not find information addressing "${sanitizedQuery}". My answers are strictly grounded in your notes to prevent hallucinations. Please make sure the relevant document or lecture notes are uploaded to the Document Library.`,
      citations: [],
      isGrounded: false,
      retrievedCount: 0,
    };
  }

  const similarChunks = scoredChunks;

  // 5. Prepare retrieved context and citations
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

