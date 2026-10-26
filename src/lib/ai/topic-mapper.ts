import type { Topic, DocumentChunk, TopicChunkMapping } from '@/lib/types';
import { generateEmbedding } from './embeddings';
import { repository } from '@/lib/db/repository';

export interface TopicCoverageReport {
  topicId: string;
  topicName: string;
  level: number;
  mappedChunkCount: number;
  hasSufficientMaterial: boolean;
  topChunks: Array<{
    chunkId: string;
    documentId: string;
    pageNumber: number | null;
    sectionTitle: string | null;
    relevanceScore: number;
    preview: string;
  }>;
}

/**
 * Calculates cosine similarity between two unit vectors.
 */
function cosineSim(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

/**
 * Maps document chunks to syllabus topics using hybrid vector similarity and keyword cues.
 */
export async function mapChunksToTopics(
  topics: Topic[],
  chunks: DocumentChunk[],
  minSimilarity: number = 0.3
): Promise<TopicChunkMapping[]> {
  const mappings: Omit<TopicChunkMapping, 'id' | 'createdAt'>[] = [];

  // Generate topic embeddings if not precalculated
  const topicEmbeddings = new Map<string, number[]>();
  for (const topic of topics) {
    const textToEmbed = `${topic.name}. ${topic.description || ''}`;
    const emb = await generateEmbedding(textToEmbed);
    topicEmbeddings.set(topic.id, emb);
  }

  for (const topic of topics) {
    const tEmb = topicEmbeddings.get(topic.id);
    if (!tEmb) continue;

    const topicWords = topic.name.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

    for (const chunk of chunks) {
      let sim = 0;
      if (chunk.embedding && chunk.embedding.length > 0) {
        sim = cosineSim(tEmb, chunk.embedding);
      }

      // Check section heading and content lexical match bonus
      const chunkLower = chunk.content.toLowerCase();
      const headingLower = (chunk.sectionTitle || '').toLowerCase();

      let keywordMatch = 0;
      for (const word of topicWords) {
        if (headingLower.includes(word)) keywordMatch += 0.2;
        else if (chunkLower.includes(word)) keywordMatch += 0.05;
      }

      const totalScore = Math.min(1.0, sim + keywordMatch);

      if (totalScore >= minSimilarity) {
        mappings.push({
          topicId: topic.id,
          chunkId: chunk.id,
          relevanceScore: parseFloat(totalScore.toFixed(4)),
          method: keywordMatch > 0.1 ? 'keyword' : 'semantic',
        });
      }
    }
  }

  return repository.saveTopicChunkMappings(mappings);
}

/**
 * Analyzes topic coverage across mapped material and identifies gaps where
 * no sufficient supporting notes or textbook chapters were uploaded.
 */
export async function analyzeTopicCoverage(
  userId: string,
  subjectId: string
): Promise<TopicCoverageReport[]> {
  const topics = await repository.getTopics(userId, subjectId);
  const reports: TopicCoverageReport[] = [];

  for (const topic of topics) {
    const mappings = await repository.getMappingsForTopic(topic.id);
    const topChunks = mappings
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5)
      .map((m) => ({
        chunkId: m.chunkId,
        documentId: m.chunk.documentId,
        pageNumber: m.chunk.pageNumber ?? null,
        sectionTitle: m.chunk.sectionTitle ?? null,
        relevanceScore: m.relevanceScore,
        preview: m.chunk.content.slice(0, 150) + (m.chunk.content.length > 150 ? '...' : ''),
      }));

    // Minimum requirement: At least 1 chunk with good relevance (>= 0.35) or multiple chunks
    const hasSufficient = topChunks.length > 0 && (topChunks[0].relevanceScore >= 0.35 || topChunks.length >= 2);

    reports.push({
      topicId: topic.id,
      topicName: topic.name,
      level: topic.level,
      mappedChunkCount: mappings.length,
      hasSufficientMaterial: hasSufficient,
      topChunks,
    });
  }

  return reports;
}
