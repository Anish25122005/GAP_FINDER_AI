import { describe, it, expect, beforeEach } from 'vitest';
import { repository } from '@/lib/db/repository';
import { generateQuestionsForTopic } from '@/lib/ai/question-generator';
import { gradeMultipleChoice } from '@/lib/ai/evaluator';
import { validateQuestion } from '@/lib/ai/question-validator';
import type { Subject, Topic, DocumentChunk, GeneratedQuestion, Quiz } from '@/lib/types';

describe('Quiz Persistence, Isolation, and Semantic Quality Tests', () => {
  const userId = 'quiz_quality_tester';
  let subjectId: string;
  let topicOS: Topic;
  let topicDB: Topic;
  let topicNet: Topic;

  beforeEach(async () => {
    const subject = await repository.createSubject(userId, {
      name: 'Computer Science Core',
      code: 'CS_CORE',
    });
    subjectId = subject.id;

    topicOS = {
      id: 'top_os_sync',
      subjectId,
      userId,
      name: 'Process Synchronization',
      level: 2,
      orderIndex: 1,
      weight: 1.0,
      createdAt: new Date().toISOString(),
    };

    topicDB = {
      id: 'top_db_acid',
      subjectId,
      userId,
      name: 'Database Transactions',
      level: 2,
      orderIndex: 2,
      weight: 1.0,
      createdAt: new Date().toISOString(),
    };

    topicNet = {
      id: 'top_net_dns',
      subjectId,
      userId,
      name: 'Name Resolution Systems',
      level: 2,
      orderIndex: 3,
      weight: 1.0,
      createdAt: new Date().toISOString(),
    };
  });

  it('persists questionIds in database and ensures two quizzes for the same subject load distinct question sets', async () => {
    // 1. Create 4 questions manually or via generator
    const q1: GeneratedQuestion = {
      id: 'q_sync_1',
      userId,
      subjectId,
      topicId: topicOS.id,
      questionText: 'What synchronization problem does Peterson solution resolve for two processes?',
      questionType: 'mcq',
      difficulty: 'medium',
      options: [
        'Critical section mutual exclusion',
        'Deadlock detection in multi-threaded kernels',
        'Contiguous physical memory fragmentation',
        'Dynamic packet routing across network nodes',
      ],
      correctAnswer: 'Critical section mutual exclusion',
      explanation: 'Petersons algorithm provides software mutual exclusion for two processes.',
      citationMetadata: [{ documentId: 'd1', documentTitle: 'OS Notes', chunkId: 'c1', excerpt: 'Petersons algorithm' }],
      createdAt: new Date().toISOString(),
    };

    const q2: GeneratedQuestion = {
      id: 'q_sync_2',
      userId,
      subjectId,
      topicId: topicOS.id,
      questionText: 'Which condition is NOT one of the four Coffman conditions for deadlock?',
      questionType: 'mcq',
      difficulty: 'hard',
      options: [
        'Mutual exclusion',
        'Hold and wait',
        'Circular wait',
        'Preemptive time-sliced CPU allocation',
      ],
      correctAnswer: 'Preemptive time-sliced CPU allocation',
      explanation: 'No preemption is a deadlock condition; preemptive allocation prevents circular wait.',
      citationMetadata: [{ documentId: 'd1', documentTitle: 'OS Notes', chunkId: 'c1', excerpt: 'Deadlock conditions' }],
      createdAt: new Date().toISOString(),
    };

    const q3: GeneratedQuestion = {
      id: 'q_db_1',
      userId,
      subjectId,
      topicId: topicDB.id,
      questionText: 'How does the Write-Ahead Logging (WAL) protocol guarantee durability?',
      questionType: 'mcq',
      difficulty: 'hard',
      options: [
        'Flushes log records to non-volatile disk before committing data pages',
        'Disables dirty read isolation levels across concurrent transactions',
        'Enforces distributed two-phase commits across replica nodes',
        'Encrypts transaction payloads using asymmetric key cryptography',
      ],
      correctAnswer: 'Flushes log records to non-volatile disk before committing data pages',
      explanation: 'WAL ensures log changes precede actual database file page writes.',
      citationMetadata: [{ documentId: 'd2', documentTitle: 'DB Notes', chunkId: 'c2', excerpt: 'WAL protocol' }],
      createdAt: new Date().toISOString(),
    };

    const q4: GeneratedQuestion = {
      id: 'q_db_2',
      userId,
      subjectId,
      topicId: topicDB.id,
      questionText: 'What phenomenon is prevented by Serializable transaction isolation level?',
      questionType: 'mcq',
      difficulty: 'hard',
      options: [
        'Phantom reads and non-repeatable reads',
        'Hardware memory bus cache invalidations',
        'Disk head thrashing during sequential scans',
        'Network packet fragmentation across MTU boundaries',
      ],
      correctAnswer: 'Phantom reads and non-repeatable reads',
      explanation: 'Serializable isolation prevents anomalies like dirty reads, non-repeatable reads, and phantoms.',
      citationMetadata: [{ documentId: 'd2', documentTitle: 'DB Notes', chunkId: 'c2', excerpt: 'Isolation anomalies' }],
      createdAt: new Date().toISOString(),
    };

    await repository.saveQuestions([q1, q2, q3, q4]);

    // 2. Create Quiz A with questions [q1, q2]
    const quizA = await repository.createQuiz(userId, {
      subjectId,
      title: 'OS Synchronization Quiz',
      questionCount: 2,
      topicIds: [topicOS.id],
      questionIds: [q1.id, q2.id],
    });

    // 3. Create Quiz B with questions [q3, q4] for the same subject
    const quizB = await repository.createQuiz(userId, {
      subjectId,
      title: 'Database Transactions Quiz',
      questionCount: 2,
      topicIds: [topicDB.id],
      questionIds: [q3.id, q4.id],
    });

    // 4. Reload both quizzes from repository
    const loadedA = await repository.getQuizById(userId, quizA.id);
    const loadedB = await repository.getQuizById(userId, quizB.id);

    expect(loadedA).toBeDefined();
    expect(loadedB).toBeDefined();

    // Verify Quiz A loaded exactly [q1, q2] in intended order
    const loadedAIds = loadedA!.questions!.map((q) => q.id);
    expect(loadedAIds).toEqual([q1.id, q2.id]);
    expect(loadedA!.questions![0].questionText).toBe(q1.questionText);
    expect(loadedA!.questions![1].questionText).toBe(q2.questionText);

    // Verify Quiz B loaded exactly [q3, q4] in intended order
    const loadedBIds = loadedB!.questions!.map((q) => q.id);
    expect(loadedBIds).toEqual([q3.id, q4.id]);
    expect(loadedB!.questions![0].questionText).toBe(q3.questionText);
    expect(loadedB!.questions![1].questionText).toBe(q4.questionText);

    // Verify grading and answer alignment remain intact on reloaded questions
    const gradeA1 = gradeMultipleChoice(loadedA!.questions![0], q1.correctAnswer, 'a1');
    expect(gradeA1.correctness).toBe('correct');
    expect(gradeA1.score).toBe(1.0);

    const gradeB1 = gradeMultipleChoice(loadedB!.questions![0], q3.correctAnswer, 'b1');
    expect(gradeB1.correctness).toBe('correct');
    expect(gradeB1.score).toBe(1.0);
  });

  it('supports legacy quizzes missing questionIds field gracefully via fallback', async () => {
    const qLegacy: GeneratedQuestion = {
      id: 'q_legacy_1',
      userId,
      subjectId,
      topicId: topicNet.id,
      questionText: 'What is the function of authoritative DNS name servers?',
      questionType: 'mcq',
      difficulty: 'medium',
      options: [
        'Stores definitive resource records for its configured zone',
        'Routes BGP packets across international borders',
        'Generates SSL/TLS certificates dynamically',
        'Allocates dynamic IP addresses via DHCP leases',
      ],
      correctAnswer: 'Stores definitive resource records for its configured zone',
      explanation: 'Authoritative servers hold official records for specific domains.',
      citationMetadata: [{ documentId: 'd3', documentTitle: 'DNS Notes', chunkId: 'c3', excerpt: 'Authoritative DNS' }],
      createdAt: new Date().toISOString(),
    };

    await repository.saveQuestions([qLegacy]);

    // Simulate legacy quiz with no questionIds
    const store = (repository as any).loadStore();
    const legacyQuiz: Quiz = {
      id: 'legacy_quiz_1',
      userId,
      subjectId,
      title: 'Legacy DNS Assessment',
      questionCount: 1,
      status: 'ready',
      topicIds: [topicNet.id],
      // questionIds is intentionally omitted/undefined
      createdAt: new Date().toISOString(),
    };
    store.quizzes.push(legacyQuiz);
    (repository as any).saveStore();

    // Reload legacy quiz
    const reloaded = await repository.getQuizById(userId, 'legacy_quiz_1');
    expect(reloaded).toBeDefined();
    expect(reloaded!.questions).toBeDefined();
    expect(reloaded!.questions!.length).toBe(1);
    expect(reloaded!.questions![0].id).toBe(qLegacy.id);
    expect(reloaded!.questions![0].correctAnswer).toBe(qLegacy.correctAnswer);
  });

  it('generates academically plausible questions and distractors across three different topics without boilerplate', async () => {
    // Topic 1: Concurrency (OS)
    const chunkSync: DocumentChunk = {
      id: 'chk_sync',
      documentId: 'doc_1',
      userId,
      subjectId,
      chunkIndex: 0,
      pageNumber: 1,
      sectionTitle: 'Synchronization',
      content:
        'Mutex Locks and Semaphores solve the critical section problem by enforcing mutual exclusion. Peterson solution provides a software-based approach for two processes. Deadlocks occur when four conditions hold simultaneously: mutual exclusion, hold and wait, no preemption, and circular wait.',
      tokenCount: 45,
      createdAt: new Date().toISOString(),
    };

    // Topic 2: Database Transactions (ACID)
    const chunkDB: DocumentChunk = {
      id: 'chk_acid',
      documentId: 'doc_2',
      userId,
      subjectId,
      chunkIndex: 0,
      pageNumber: 1,
      sectionTitle: 'ACID Properties',
      content:
        'Atomicity guarantees that all transaction operations execute completely or abort with rollback. Isolation levels prevent dirty reads, non-repeatable reads, and phantom reads. Write-Ahead Logging preserves durability across hardware crashes.',
      tokenCount: 40,
      createdAt: new Date().toISOString(),
    };

    // Topic 3: Network Domain Resolution (DNS)
    const chunkDNS: DocumentChunk = {
      id: 'chk_dns',
      documentId: 'doc_3',
      userId,
      subjectId,
      chunkIndex: 0,
      pageNumber: 1,
      sectionTitle: 'DNS Architecture',
      content:
        'The Domain Name System translates human-readable hostnames into numeric IP addresses. Recursive resolvers query root servers, top-level domain servers, and authoritative servers. DNS caching reduces lookup latency across the network.',
      tokenCount: 38,
      createdAt: new Date().toISOString(),
    };

    const [qListSync, qListDB, qListDNS] = await Promise.all([
      generateQuestionsForTopic({
        userId,
        subjectId,
        topic: topicOS,
        chunks: [chunkSync],
        count: 1,
        preferType: 'mcq',
      }),
      generateQuestionsForTopic({
        userId,
        subjectId,
        topic: topicDB,
        chunks: [chunkDB],
        count: 1,
        preferType: 'mcq',
      }),
      generateQuestionsForTopic({
        userId,
        subjectId,
        topic: topicNet,
        chunks: [chunkDNS],
        count: 1,
        preferType: 'mcq',
      }),
    ]);

    const qSync = qListSync[0];
    const qDB = qListDB[0];
    const qDNS = qListDNS[0];

    // 1. Verify question stems are distinct and non-formulaic
    expect(qSync.questionText).not.toBe(qDB.questionText);
    expect(qDB.questionText).not.toBe(qDNS.questionText);
    expect(qSync.questionText).not.toContain('According to the course notes on');

    // 2. Verify all questions pass question validation
    for (const q of [qSync, qDB, qDNS]) {
      const val = validateQuestion(q);
      expect(val.isValid).toBe(true);
      expect(val.errors).toHaveLength(0);
    }

    // 3. Verify no generic robotic distractors
    const forbiddenPhrases = [
      'an external monitoring layer',
      'a static configuration unrelated to',
      'a sequential validation of',
      'alternative aspect of',
      'without automated rule checks',
      'superseded by unvalidated assumptions',
    ];

    for (const q of [qSync, qDB, qDNS]) {
      expect(q.options).toHaveLength(4);
      expect(q.options).toContain(q.correctAnswer);
      for (const opt of q.options!) {
        for (const phrase of forbiddenPhrases) {
          expect(opt.toLowerCase()).not.toContain(phrase);
        }
      }
    }

    // 4. Verify distractors are specific to subject concepts and differ across topics
    expect(qSync.options).not.toEqual(qDB.options);
    expect(qDB.options).not.toEqual(qDNS.options);
  });
});
