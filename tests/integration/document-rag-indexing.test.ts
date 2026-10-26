import { describe, it, expect, beforeEach } from 'vitest';
import { repository } from '@/lib/db/repository';
import { extractTextFromTxt } from '@/lib/ai/text-extractor';
import { chunkExtractedDocument } from '@/lib/ai/chunker';
import { generateEmbeddings, generateEmbedding } from '@/lib/ai/embeddings';

describe('Document Processing & RAG Vector Retrieval Integration Tests', () => {
  const userId = 'user_rag_test';
  let subjectId: string;
  let docId: string;

  beforeEach(async () => {
    const subject = await repository.createSubject(userId, {
      name: 'Cloud Infrastructure & Distributed Storage',
    });
    subjectId = subject.id;

    const notes = `
Section 1: Consistent Hashing Architecture
Consistent Hashing maps keys and physical nodes to a circular hash ring from 0 to 2^32 - 1.
Virtual nodes (vnodes) prevent hotspotting and ensure uniform data distribution across heterogeneous servers.
When a node leaves or joins, only K/N keys need rebalancing.

Section 2: Replication and Quorums
Replication provides fault tolerance. The quorum condition R + W > N ensures linearizability.
In a 3-replica cluster, R=2 and W=2 guarantees that read operations intersect with the latest write.
`;

    const doc = await repository.createDocument(userId, {
      subjectId,
      title: 'Distributed Storage Lecture Notes',
      filename: 'storage_notes.txt',
      fileType: 'txt',
      fileSize: Buffer.byteLength(notes, 'utf-8'),
      status: 'processing',
    });
    docId = doc.id;

    const extraction = extractTextFromTxt(Buffer.from(notes, 'utf-8'));
    const chunks = chunkExtractedDocument(extraction);
    const chunkTexts = chunks.map((c) => `${c.sectionTitle || ''}: ${c.content}`);
    const embeddings = await generateEmbeddings(chunkTexts);

    const chunkRecords = chunks.map((c, idx) => ({
      documentId: doc.id,
      userId,
      subjectId,
      chunkIndex: c.chunkIndex,
      pageNumber: c.pageNumber,
      sectionTitle: c.sectionTitle,
      content: c.content,
      tokenCount: c.tokenCount,
      embedding: embeddings[idx],
    }));

    await repository.saveChunks(chunkRecords);
  });

  it('correctly chunks and indexes document into vector store', async () => {
    const doc = await repository.getDocumentById(userId, docId);
    expect(doc).not.toBeNull();
    expect(doc?.status).toBe('indexed');
    expect(doc?.chunkCount).toBeGreaterThan(0);

    const chunks = await repository.getChunksByDocumentId(userId, docId);
    expect(chunks.length).toBe(doc?.chunkCount);
    expect(chunks[0].embedding?.length).toBe(1536);
  });

  it('retrieves relevant chunk using semantic vector similarity search', async () => {
    const query = 'How do virtual nodes prevent hotspotting on the hash ring?';
    const queryEmb = await generateEmbedding(query);

    const results = await repository.searchSimilarChunks(userId, queryEmb, {
      subjectId,
      limit: 3,
      threshold: 0.1,
    });

    expect(results.length).toBeGreaterThan(0);
    // Top result should contain consistent hashing and vnodes
    const topResult = results[0];
    expect(topResult.content).toContain('Consistent Hashing');
    expect(topResult.similarity).toBeGreaterThan(0.15);
  });
});
