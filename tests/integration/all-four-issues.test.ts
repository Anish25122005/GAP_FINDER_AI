import { describe, it, expect, beforeEach } from 'vitest';
import { repository } from '@/lib/db/repository';
import { extractTextFromPdf } from '@/lib/ai/text-extractor';
import { chunkExtractedDocument } from '@/lib/ai/chunker';
import { generateEmbeddings, generateEmbedding } from '@/lib/ai/embeddings';
import { parseSyllabusStructure, parseSyllabusWithMetadata, flattenTopicTree } from '@/lib/ai/syllabus-parser';
import { mapChunksToTopics } from '@/lib/ai/topic-mapper';
import { generateQuestionsForTopic } from '@/lib/ai/question-generator';

const osSyllabus = `Course Objectives:
The main objectives of the course are to provide understanding the fundamental concepts,
functions, and management techniques of operating systems

UNIT-I:
Operating Systems Overview: Introduction, operating system functions, operating systems
operations, Computing environments, Free and Open-Source Operating Systems System
Structures: Operating System Services, User and Operating-System Interface, system calls,
Types of System Calls, system programs, operating system Design and Implementation,
operating system structure, Building and Booting an Operating System, Operating system
debugging

UNIT-II:
Processes: Process Concept, Process scheduling, Operations on processes, Inter-process
communication. Threads and Concurrency: Multithreading models, Thread libraries,
Threadingissues. CPU Scheduling: Basic concepts, Scheduling criteria, Scheduling
algorithms, Multiple processor scheduling.

UNIT–III:
Synchronization Tools: The Critical Section Problem, Peterson’s Solution, Mutex Locks,
semaphores, Monitors, Classic problems of Synchronization. Deadlocks: system Model,
Deadlock characterization, Methods for handling Deadlocks, Deadlock prevention, Deadlock
avoidance, Deadlock detection, Recovery from Deadlock.

UNIT-IV:
Memory- Management Strategies: Introduction, Contiguous memory allocation, Paging,
Structure of the Page Table, Swapping. Virtual Memory Management: Introduction, Demand
paging, Copy-on-write, Page replacement Allocation of frames, Thrashing Storage
Management: Overview of Mass Storage Structure, HDD Scheduling.

UNIT-V:
File System: File System Interface: File concept, Access methods, Directory Structure; File-
system Implementation: File-system structure, File-system Operations, Directory
implementation, Allocation method, Free space management; File-System Internals: File-
System Mounting, Partitions and Mounting, File Sharing. Protection: Goals of protection,
Principles of protection, Protection Rings, Domain of protection, Access matrix`;

const validPdfString = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 85 >>
stream
BT
/F1 24 Tf
100 700 Td
(Operating Systems: Process Scheduling and Deadlocks) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000224 00000 n 
0000000295 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
419
%%EOF`;

describe('Comprehensive Verification of All Four Issues', () => {
  const userId = 'user_issue_validation_test';
  let subjectId: string;

  beforeEach(async () => {
    const subject = await repository.createSubject(userId, {
      name: 'Operating Systems',
      code: 'CS301',
    });
    subjectId = subject.id;
  });

  // ============================================================================
  // ISSUE 1: PDF HANDLING & WORKER CONFIGURATION
  // ============================================================================
  describe('Issue 1: PDF Extraction and Worker Configuration', () => {
    it('successfully extracts text from a real text-based PDF using local worker', async () => {
      const buffer = Buffer.from(validPdfString, 'utf-8');
      const extraction = await extractTextFromPdf(buffer);

      expect(extraction).toBeDefined();
      expect(extraction.text).toContain('Operating Systems: Process Scheduling');
      expect(extraction.pageCount).toBe(1);
      expect(extraction.pages.length).toBe(1);
    });

    it('rejects corrupted PDF buffers with a clear descriptive error', async () => {
      const corrupt = Buffer.from('corrupted non-pdf binary content', 'utf-8');
      await expect(extractTextFromPdf(corrupt)).rejects.toThrow('corrupted or has an invalid structure');
    });

    it('rejects image-only / scanned PDFs lacking extractable text', async () => {
      const emptyPdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 300 144]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000053 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF';
      await expect(extractTextFromPdf(Buffer.from(emptyPdf))).rejects.toThrow('contains little to no extractable text');
    });
  });

  // ============================================================================
  // ISSUE 2: DOCUMENT REMOVAL & CASCADING CLEANUP
  // ============================================================================
  describe('Issue 2: Document Deletion and Cascading Cleanup', () => {
    it('deletes document and all its indexed chunks and topic mappings', async () => {
      // 1. Create document
      const doc = await repository.createDocument(userId, {
        subjectId,
        title: 'CPU Scheduling Notes',
        filename: 'cpu_notes.txt',
        fileType: 'txt',
        fileSize: 1024,
        status: 'processing',
      });

      // 2. Save chunks
      const chunkRecords = [
        {
          documentId: doc.id,
          userId,
          subjectId,
          chunkIndex: 0,
          content: 'CPU Scheduling determines which process in ready queue gets CPU time.',
          embedding: [0.1, 0.2, 0.3],
        },
      ];
      const savedChunks = await repository.saveChunks(chunkRecords);
      expect(savedChunks.length).toBe(1);

      // 3. Create topic and mapping
      const topic = await repository.addTopic(userId, {
        subjectId,
        name: 'CPU Scheduling',
        level: 2,
        orderIndex: 1,
        weight: 1.0,
      });

      await repository.saveTopicChunkMappings([
        {
          topicId: topic.id,
          chunkId: savedChunks[0].id,
          relevanceScore: 0.9,
          method: 'semantic',
        },
      ]);

      // Verify mapping exists
      const beforeMappings = await repository.getMappingsForTopic(topic.id);
      expect(beforeMappings.length).toBe(1);

      // 4. Delete document
      const deleted = await repository.deleteDocument(userId, doc.id);
      expect(deleted).toBe(true);

      // 5. Verify document is gone
      const fetchedDoc = await repository.getDocumentById(userId, doc.id);
      expect(fetchedDoc).toBeNull();

      // 6. Verify chunks are gone
      const fetchedChunks = await repository.getChunksByDocumentId(userId, doc.id);
      expect(fetchedChunks.length).toBe(0);

      // 7. Verify mappings are cleaned up
      const afterMappings = await repository.getMappingsForTopic(topic.id);
      expect(afterMappings.length).toBe(0);
    });

    it('enforces user ownership when deleting documents', async () => {
      const doc = await repository.createDocument(userId, {
        subjectId,
        title: 'Private Notes',
        filename: 'private.txt',
        fileType: 'txt',
        fileSize: 500,
        status: 'indexed',
      });

      // Another user attempts to delete
      const anotherUserDeleted = await repository.deleteDocument('intruder_user_id', doc.id);
      expect(anotherUserDeleted).toBe(false);

      // Verify original document still exists
      const docStillThere = await repository.getDocumentById(userId, doc.id);
      expect(docStillThere).not.toBeNull();
    });
  });

  // ============================================================================
  // ISSUE 3: SYLLABUS PARSER & DATABASE INTEGRITY
  // ============================================================================
  describe('Issue 3: Syllabus Parsing and Database Hierarchy', () => {
    it('extracts exactly 5 units and keeps Course Objectives separate', async () => {
      const res = await parseSyllabusWithMetadata(osSyllabus);
      expect(res.units.length).toBe(5);
      expect(res.units.map((u) => u.code)).toEqual(['UI', 'UII', 'UIII', 'UIV', 'UV']);

      expect(res.objectives.length).toBeGreaterThan(0);
      expect(res.objectives[0]).toContain('understanding the fundamental concepts');

      for (const u of res.units) {
        expect(u.name.toLowerCase()).not.toContain('objectives');
      }
    });

    it('correctly extracts major topics and subtopics for each unit', () => {
      const units = parseSyllabusStructure(osSyllabus);

      // Unit I
      const u1Topics = units[0].children!.map((c) => c.name);
      expect(u1Topics).toContain('Operating Systems Overview');

      // Unit II
      const u2Topics = units[1].children!.map((c) => c.name);
      expect(u2Topics).toContain('Processes');
      expect(u2Topics).toContain('Threads and Concurrency');
      expect(u2Topics).toContain('CPU Scheduling');

      // Unit III
      const u3Topics = units[2].children!.map((c) => c.name);
      expect(u3Topics).toContain('Synchronization Tools');
      expect(u3Topics).toContain('Deadlocks');

      // Unit IV
      const u4Topics = units[3].children!.map((c) => c.name);
      expect(u4Topics.some((t) => t.includes('Memory'))).toBe(true);

      // Unit V
      const u5Topics = units[4].children!.map((c) => c.name);
      expect(u5Topics.some((t) => t.includes('Protection'))).toBe(true);
    });

    it('persists parsed topics in repository and resolves all temporary parent IDs into real UUIDs', async () => {
      const units = parseSyllabusStructure(osSyllabus);
      const flattened = flattenTopicTree(units, subjectId, userId);

      const saved = await repository.saveTopics(userId, subjectId, flattened);
      expect(saved.length).toBeGreaterThan(15);

      // Re-fetch from repository (simulates refreshing page)
      const fetchedTopics = await repository.getTopics(userId, subjectId);
      expect(fetchedTopics.length).toBe(saved.length);

      const savedUnits = fetchedTopics.filter((t) => t.level === 1);
      expect(savedUnits.length).toBe(5);

      const level1Ids = new Set(savedUnits.map((u) => u.id));

      // Level 2 topics must have a valid parentId pointing to a real Level 1 UUID
      const level2Topics = fetchedTopics.filter((t) => t.level === 2);
      expect(level2Topics.length).toBeGreaterThan(0);
      for (const l2 of level2Topics) {
        expect(l2.parentId).toBeDefined();
        expect(level1Ids.has(l2.parentId!)).toBe(true);
        // Verify parentId is NOT a temporary ID
        expect(l2.parentId!).not.toContain('temp_');
      }

      // Verify no topics are duplicated across units
      const seen = new Set<string>();
      for (const u of savedUnits) {
        const children = fetchedTopics.filter((t) => t.parentId === u.id);
        for (const ch of children) {
          const key = `${u.id}:${ch.name}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
    });
  });

  // ============================================================================
  // ISSUE 4: QUIZ GENERATION & GROUNDED EVIDENCE
  // ============================================================================
  describe('Issue 4: Diagnostic Quiz Generation and Evidence Grounding', () => {
    it('generates grounded diagnostic questions when learning material is indexed', async () => {
      // 1. Create a topic
      const topic = await repository.addTopic(userId, {
        subjectId,
        name: 'CPU Scheduling Criteria',
        level: 2,
        orderIndex: 1,
        weight: 1.0,
      });

      // 2. Create chunks for this topic
      const chunk: any = {
        id: 'chunk_sched_1',
        documentId: 'doc_sched_1',
        userId,
        subjectId,
        chunkIndex: 0,
        sectionTitle: 'CPU Scheduling',
        content:
          'CPU scheduling criteria include CPU utilization, throughput, turnaround time, waiting time, and response time. The goal is to maximize CPU utilization and throughput while minimizing waiting time.',
        pageNumber: 12,
      };

      const questions = await generateQuestionsForTopic({
        userId,
        subjectId,
        topic,
        chunks: [chunk],
        count: 2,
        preferType: 'mixed',
      });

      expect(questions.length).toBeGreaterThan(0);
      const q = questions[0];
      expect(q.topicId).toBe(topic.id);
      expect(q.citationMetadata.length).toBeGreaterThan(0);
      expect(q.citationMetadata[0].chunkId).toBe('chunk_sched_1');
      expect(q.explanation).toBeDefined();
    });

    it('throws error and does not fabricate questions when topic lacks learning material', async () => {
      const topic = await repository.addTopic(userId, {
        subjectId,
        name: 'Unsupported Unindexed Topic',
        level: 2,
        orderIndex: 2,
        weight: 1.0,
      });

      await expect(
        generateQuestionsForTopic({
          userId,
          subjectId,
          topic,
          chunks: [],
          count: 2,
        })
      ).rejects.toThrow('no learning material has been uploaded or mapped');
    });
  });
});
