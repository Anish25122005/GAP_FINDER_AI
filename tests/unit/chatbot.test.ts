import { describe, it, expect, beforeEach } from 'vitest';
import { repository } from '@/lib/db/repository';
import { askTopicAssistant } from '@/lib/ai/topic-assistant';
import { generateEmbedding } from '@/lib/ai/embeddings';
import type { Subject, DocumentRecord, DocumentChunk } from '@/lib/types';

describe('Grounded Chatbot and Assistant Retrieval Tests', () => {
  const userId = 'chat_test_user_1';
  const otherUserId = 'chat_test_user_2';
  let subjectId: string;
  let otherSubjectId: string;

  beforeEach(async () => {
    // 1. Create subject for user 1
    const subject = await repository.createSubject(userId, {
      name: 'Distributed Systems',
      code: 'CS401',
    });
    subjectId = subject.id;

    // 2. Add document and chunks for user 1
    const doc = await repository.createDocument(userId, {
      subjectId,
      title: 'Distributed Systems Notes',
      filename: 'distributed_systems_notes.pdf',
      fileType: 'pdf',
      fileSize: 1024,
      status: 'ready',
      pageCount: 5,
    } as any);

    const capContent =
      'The CAP Theorem asserts that in any distributed data store, it is impossible to simultaneously provide more than two out of three guarantees: Consistency, Availability, and Partition Tolerance. When network partitions occur, one must choose between Consistency and Availability.';

    const capEmbedding = await generateEmbedding(capContent);

    await repository.saveChunks([
      {
        documentId: doc.id,
        userId,
        subjectId,
        chunkIndex: 0,
        pageNumber: 1,
        sectionTitle: 'CAP Theorem and Consensus',
        content: capContent,
        embedding: capEmbedding,
      },
    ]);

    // 3. Create separate subject and chunk for user 2 (Isolation test)
    const otherSubject = await repository.createSubject(otherUserId, {
      name: 'Quantum Physics',
      code: 'PHYS501',
    });
    otherSubjectId = otherSubject.id;

    const otherDoc = await repository.createDocument(otherUserId, {
      subjectId: otherSubjectId,
      title: 'Quantum Secrets',
      filename: 'quantum_secrets.pdf',
      fileType: 'pdf',
      fileSize: 2048,
      status: 'ready',
      pageCount: 3,
    } as any);

    const secretContent = 'Quantum entanglement secret key distribution protocol QKD-99.';
    const secretEmbedding = await generateEmbedding(secretContent);

    await repository.saveChunks([
      {
        documentId: otherDoc.id,
        userId: otherUserId,
        subjectId: otherSubjectId,
        chunkIndex: 0,
        pageNumber: 1,
        sectionTitle: 'Secret Key Protocol',
        content: secretContent,
        embedding: secretEmbedding,
      },
    ]);
  });

  it('answers grounded question using uploaded material and provides citations', async () => {
    const question = 'What is the CAP Theorem and what trade-offs does it require during a network partition?';
    const response = await askTopicAssistant(userId, subjectId, question);

    expect(response).toBeDefined();
    expect(response.content).toBeTruthy();
    expect(response.isGrounded).toBe(true);
    expect(response.retrievedCount).toBeGreaterThan(0);
    expect(response.citations.length).toBeGreaterThan(0);
    expect(response.citations[0].documentTitle).toBe('CAP Theorem and Consensus');
  });

  it('returns graceful ungrounded message when question has zero grounding in material', async () => {
    // Empty subject with no documents
    const emptySub = await repository.createSubject(userId, {
      name: 'Empty Subject',
      code: 'EMP101',
    });

    const question = 'What is photosynthesis?';
    const response = await askTopicAssistant(userId, emptySub.id, question);

    expect(response.isGrounded).toBe(false);
    expect(response.retrievedCount).toBe(0);
    expect(response.citations.length).toBe(0);
    expect(response.content).toContain('learning material');
  });

  it('strictly isolates user data: user 1 cannot retrieve user 2 chunks', async () => {
    // User 1 queries their subject about user 2 secret content
    const response = await askTopicAssistant(userId, subjectId, 'Tell me about Quantum entanglement QKD-99');

    // Should NOT cite or retrieve user 2's document
    for (const citation of response.citations) {
      expect(citation.documentTitle).not.toContain('Secret Key Protocol');
    }
  });

  it('does NOT confidently cite irrelevant chunks when question is absent from the subject notes', async () => {
    // The subject has Distributed Systems notes, but the question is about an unrelated topic (cellular biology)
    const unrelatedQuestion = 'What is the molecular mechanism of chlorophyll light absorption in chloroplasts?';
    const response = await askTopicAssistant(userId, subjectId, unrelatedQuestion);

    // Must NOT return citations to Distributed Systems notes
    expect(response.isGrounded).toBe(false);
    expect(response.retrievedCount).toBe(0);
    expect(response.citations).toHaveLength(0);
    expect(response.content).toContain('could not find information addressing');
  });
});
