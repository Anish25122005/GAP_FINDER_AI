import { describe, it, expect, beforeEach } from 'vitest';
import { repository } from '@/lib/db/repository';
import { generateEmbedding } from '@/lib/ai/embeddings';

describe('User Authorization & Data Isolation Integration Tests', () => {
  const userA = 'user_alice_uuid';
  const userB = 'user_bob_uuid';

  let docUserAId: string;

  beforeEach(async () => {
    // User A creates subject and document
    const subjectA = await repository.createSubject(userA, { name: 'Alice Private Course' });
    const docA = await repository.createDocument(userA, {
      subjectId: subjectA.id,
      title: 'Alice Confidential Research Notes',
      filename: 'alice_notes.txt',
      fileType: 'txt',
      fileSize: 500,
      status: 'uploaded',
    });
    docUserAId = docA.id;

    const emb = await generateEmbedding('Secret quantum consensus algorithms');
    await repository.saveChunks([
      {
        documentId: docA.id,
        userId: userA,
        subjectId: subjectA.id,
        chunkIndex: 0,
        pageNumber: 1,
        sectionTitle: 'Classified',
        content: 'Confidential research: Quantum Byzantine Agreement Protocol.',
        tokenCount: 15,
        embedding: emb,
      },
    ]);

    // User B creates subject
    await repository.createSubject(userB, { name: 'Bob Course' });
  });

  it('prevents User B from accessing User A documents by ID', async () => {
    const doc = await repository.getDocumentById(userB, docUserAId);
    expect(doc).toBeNull(); // Must return null for unauthorized user
  });

  it('prevents User B from listing User A documents', async () => {
    const bDocs = await repository.getDocuments(userB);
    const hasAliceDoc = bDocs.some((d) => d.id === docUserAId);
    expect(hasAliceDoc).toBe(false);
  });

  it('enforces vector search isolation: User B search never leaks User A chunks', async () => {
    const queryEmb = await generateEmbedding('Quantum Byzantine Agreement Protocol');

    const bobResults = await repository.searchSimilarChunks(userB, queryEmb, {
      limit: 5,
      threshold: 0.1,
    });

    // Bob must receive zero chunks from Alice's private document
    const leakedChunk = bobResults.find((c) => c.userId === userA);
    expect(leakedChunk).toBeUndefined();
    expect(bobResults.length).toBe(0);
  });
});
