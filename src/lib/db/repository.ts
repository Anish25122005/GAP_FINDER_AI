import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
  UserProfile,
  Subject,
  SyllabusDocument,
  Topic,
  DocumentRecord,
  DocumentChunk,
  TopicChunkMapping,
  GeneratedQuestion,
  Quiz,
  QuizAttempt,
  StudentAnswer,
  AnswerEvaluation,
  TopicMasterySnapshot,
  RevisionPlan,
  RevisionPlanItem,
  ChatSession,
  ChatMessage,
  ProcessingJob,
} from '@/lib/types';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

interface LocalStoreData {
  users: (UserProfile & { passwordHash: string })[];
  subjects: Subject[];
  syllabusDocuments: SyllabusDocument[];
  topics: Topic[];
  documents: DocumentRecord[];
  chunks: DocumentChunk[];
  topicChunkMappings: TopicChunkMapping[];
  questions: GeneratedQuestion[];
  quizzes: Quiz[];
  quizAttempts: QuizAttempt[];
  studentAnswers: StudentAnswer[];
  evaluations: AnswerEvaluation[];
  masterySnapshots: TopicMasterySnapshot[];
  revisionPlans: RevisionPlan[];
  revisionPlanItems: RevisionPlanItem[];
  chatSessions: ChatSession[];
  chatMessages: ChatMessage[];
  jobs: ProcessingJob[];
}

const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', '.gapfinder_data')
  : path.join(process.cwd(), '.gapfinder_data');

const DATA_FILE = process.env.VITEST_POOL_ID
  ? path.join(DATA_DIR, `store_worker_${process.env.VITEST_POOL_ID}.json`)
  : path.join(DATA_DIR, 'store.json');

class Repository {
  private memoryStore: LocalStoreData | null = null;

  private isSupabaseConfigured(): boolean {
    return Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-id')
    );
  }

  private loadStore(): LocalStoreData {
    if (this.memoryStore) return this.memoryStore;

    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        this.memoryStore = JSON.parse(raw);
        return this.memoryStore!;
      }
    } catch (e) {
      console.warn('Failed to read local store, reinitializing:', e);
    }

    this.memoryStore = {
      users: [],
      subjects: [],
      syllabusDocuments: [],
      topics: [],
      documents: [],
      chunks: [],
      topicChunkMappings: [],
      questions: [],
      quizzes: [],
      quizAttempts: [],
      studentAnswers: [],
      evaluations: [],
      masterySnapshots: [],
      revisionPlans: [],
      revisionPlanItems: [],
      chatSessions: [],
      chatMessages: [],
      jobs: [],
    };
    this.saveStore();
    return this.memoryStore;
  }

  private saveStore() {
    if (!this.memoryStore) return;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tempFile = `${DATA_FILE}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(this.memoryStore, null, 2), 'utf-8');
      try {
        if (fs.existsSync(DATA_FILE)) {
          fs.unlinkSync(DATA_FILE);
        }
        fs.renameSync(tempFile, DATA_FILE);
      } catch {
        fs.writeFileSync(DATA_FILE, JSON.stringify(this.memoryStore, null, 2), 'utf-8');
        try { fs.unlinkSync(tempFile); } catch {}
      }
    } catch (e) {
      console.error('Failed to save store to file:', e);
    }
  }

  // --------------------------------------------------------------------------
  // USER / AUTH METHODS
  // --------------------------------------------------------------------------

  async createUser(email: string, password: string,fullName?: string): Promise<UserProfile> {
    const store = this.loadStore();
    const existing = store.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      throw new Error('User with this email already exists.');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    const passwordHash = `${salt}:${hash}`;

    const newUser: UserProfile & { passwordHash: string } = {
      id: crypto.randomUUID(),
      email: email.toLowerCase(),
      fullName: fullName || email.split('@')[0],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      passwordHash,
    };

    store.users.push(newUser);
    this.saveStore();

    const { passwordHash: _, ...profile } = newUser;
    return profile;
  }

  async verifyUser(email: string, password: string): Promise<UserProfile | null> {
    const store = this.loadStore();
    const user = store.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return null;

    const [salt, key] = user.passwordHash.split(':');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    if (hash !== key) return null;

    const { passwordHash: _, ...profile } = user;
    return profile;
  }

  async getUserById(id: string): Promise<UserProfile | null> {
    const store = this.loadStore();
    const user = store.users.find(
      (u) => u.id === id || u.email.toLowerCase() === id.toLowerCase()
    );
    if (!user) return null;
    const { passwordHash: _, ...profile } = user;
    return profile;
  }

  // --------------------------------------------------------------------------
  // SUBJECTS
  // --------------------------------------------------------------------------

  async getSubjects(userId: string): Promise<Subject[]> {
    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase
          .from('subjects')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        if (!error && data) {
          return data.map((d: any) => ({
            id: d.id,
            userId: d.user_id,
            name: d.name,
            code: d.code,
            description: d.description,
            createdAt: d.created_at,
            updatedAt: d.updated_at,
          }));
        }
      }
    }

    const store = this.loadStore();
    return store.subjects.filter((s) => s.userId === userId);
  }

  async getSubjectById(userId: string, id: string): Promise<Subject | null> {
    const subjects = await this.getSubjects(userId);
    return subjects.find((s) => s.id === id) || null;
  }

  async createSubject(
    userId: string,
    data: { name: string; code?: string; description?: string }
  ): Promise<Subject> {
    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        const { data: result, error } = await supabase
          .from('subjects')
          .insert({
            user_id: userId,
            name: data.name,
            code: data.code,
            description: data.description,
          })
          .select()
          .single();
        if (!error && result) {
          return {
            id: result.id,
            userId: result.user_id,
            name: result.name,
            code: result.code,
            description: result.description,
            createdAt: result.created_at,
            updatedAt: result.updated_at,
          };
        }
      }
    }

    const store = this.loadStore();
    const subject: Subject = {
      id: crypto.randomUUID(),
      userId,
      name: data.name,
      code: data.code,
      description: data.description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.subjects.push(subject);
    this.saveStore();
    return subject;
  }

  async deleteSubject(userId: string, id: string): Promise<boolean> {
    const store = this.loadStore();
    const idx = store.subjects.findIndex((s) => s.id === id && s.userId === userId);
    if (idx === -1) return false;
    store.subjects.splice(idx, 1);
    store.topics = store.topics.filter((t) => t.subjectId !== id);
    store.documents = store.documents.filter((d) => d.subjectId !== id);
    store.chunks = store.chunks.filter((c) => c.subjectId !== id);
    this.saveStore();
    return true;
  }

  // --------------------------------------------------------------------------
  // TOPICS & SYLLABUS
  // --------------------------------------------------------------------------

  async getTopics(userId: string, subjectId: string): Promise<Topic[]> {
    const store = this.loadStore();
    return store.topics
      .filter((t) => t.userId === userId && t.subjectId === subjectId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async getTopicById(userId: string, id: string): Promise<Topic | null> {
    const store = this.loadStore();
    return store.topics.find((t) => t.id === id && t.userId === userId) || null;
  }

  async saveTopics(
    userId: string,
    subjectId: string,
    topics: (Omit<Topic, 'id' | 'userId' | 'createdAt' | 'subjectId'> & { subjectId?: string; _tempId?: string })[]
  ): Promise<Topic[]> {
    const store = this.loadStore();
    // Remove existing topics for subject if replacing
    store.topics = store.topics.filter((t) => !(t.userId === userId && t.subjectId === subjectId));

    // Build a map from _tempId to real UUID so parent-child references can be resolved
    const tempIdToRealId = new Map<string, string>();
    const saved: Topic[] = topics.map((t, idx) => {
      const realId = crypto.randomUUID();
      if ((t as any)._tempId) {
        tempIdToRealId.set((t as any)._tempId, realId);
      }
      const { _tempId, ...rest } = t as any;
      return {
        ...rest,
        id: realId,
        userId,
        subjectId: rest.subjectId || subjectId,
        orderIndex: rest.orderIndex ?? idx,
        createdAt: new Date().toISOString(),
      };
    });

    // Resolve parentId references: replace temp IDs with real UUIDs
    for (const topic of saved) {
      if (topic.parentId && tempIdToRealId.has(topic.parentId)) {
        topic.parentId = tempIdToRealId.get(topic.parentId)!;
      }
    }

    store.topics.push(...saved);
    this.saveStore();
    return saved;
  }

  async addTopic(userId: string, data: Omit<Topic, 'id' | 'userId' | 'createdAt'>): Promise<Topic> {
    const store = this.loadStore();
    const topic: Topic = {
      ...data,
      id: crypto.randomUUID(),
      userId,
      createdAt: new Date().toISOString(),
    };
    store.topics.push(topic);
    this.saveStore();
    return topic;
  }

  async updateTopic(userId: string, id: string, updates: Partial<Topic>): Promise<Topic | null> {
    const store = this.loadStore();
    const topic = store.topics.find((t) => t.id === id && t.userId === userId);
    if (!topic) return null;
    Object.assign(topic, updates);
    this.saveStore();
    return topic;
  }

  async deleteTopic(userId: string, id: string): Promise<boolean> {
    const store = this.loadStore();
    const idx = store.topics.findIndex((t) => t.id === id && t.userId === userId);
    if (idx === -1) return false;
    store.topics.splice(idx, 1);
    store.topicChunkMappings = store.topicChunkMappings.filter((m) => m.topicId !== id);
    this.saveStore();
    return true;
  }

  // --------------------------------------------------------------------------
  // DOCUMENTS & CHUNKS (RAG INDEXING)
  // --------------------------------------------------------------------------

  async getDocuments(userId: string, subjectId?: string): Promise<DocumentRecord[]> {
    const store = this.loadStore();
    return store.documents
      .filter((d) => d.userId === userId && (!subjectId || d.subjectId === subjectId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getDocumentById(userId: string, id: string): Promise<DocumentRecord | null> {
    const store = this.loadStore();
    return store.documents.find((d) => d.id === id && d.userId === userId) || null;
  }

  async createDocument(
    userId: string,
    data: Omit<DocumentRecord, 'id' | 'userId' | 'chunkCount' | 'createdAt' | 'updatedAt'>
  ): Promise<DocumentRecord> {
    const store = this.loadStore();
    const doc: DocumentRecord = {
      ...data,
      id: crypto.randomUUID(),
      userId,
      chunkCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.documents.push(doc);
    this.saveStore();
    return doc;
  }

  async updateDocument(userId: string, id: string, updates: Partial<DocumentRecord>): Promise<DocumentRecord | null> {
    const store = this.loadStore();
    const doc = store.documents.find((d) => d.id === id && d.userId === userId);
    if (!doc) return null;
    Object.assign(doc, updates, { updatedAt: new Date().toISOString() });
    this.saveStore();
    return doc;
  }

  async deleteDocument(userId: string, id: string): Promise<boolean> {
    const store = this.loadStore();
    const idx = store.documents.findIndex((d) => d.id === id && d.userId === userId);
    if (idx === -1) return false;

    // 1. Identify chunk IDs belonging to this document
    const deletedChunkIds = new Set(
      store.chunks.filter((c) => c.documentId === id && c.userId === userId).map((c) => c.id)
    );

    // 2. Remove document record
    store.documents.splice(idx, 1);

    // 3. Remove chunks
    store.chunks = store.chunks.filter((c) => c.documentId !== id);

    // 4. Clean up topicChunkMappings referencing deleted chunks
    store.topicChunkMappings = store.topicChunkMappings.filter(
      (m) => !deletedChunkIds.has(m.chunkId)
    );

    // 5. Delete from Supabase if configured
    if (this.isSupabaseConfigured()) {
      try {
        const supabase = await createServerSupabaseClient();
        if (supabase) {
          await supabase.from('documents').delete().eq('id', id).eq('user_id', userId);
        }
      } catch (err) {
        console.warn('Failed to delete document from Supabase:', err);
      }
    }

    this.saveStore();
    return true;
  }

  async saveChunks(chunks: Omit<DocumentChunk, 'id' | 'createdAt'>[]): Promise<DocumentChunk[]> {
    const store = this.loadStore();
    const saved: DocumentChunk[] = chunks.map((c) => ({
      ...c,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }));
    store.chunks.push(...saved);

    // Update document chunkCount
    if (saved.length > 0) {
      const doc = store.documents.find((d) => d.id === saved[0].documentId);
      if (doc) {
        doc.chunkCount = (doc.chunkCount || 0) + saved.length;
        doc.status = 'indexed';
        doc.updatedAt = new Date().toISOString();
      }
    }

    this.saveStore();
    return saved;
  }

  async getChunksByDocumentId(userId: string, documentId: string): Promise<DocumentChunk[]> {
    const store = this.loadStore();
    return store.chunks
      .filter((c) => c.userId === userId && c.documentId === documentId)
      .sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  async getChunksBySubjectId(userId: string, subjectId: string): Promise<DocumentChunk[]> {
    const store = this.loadStore();
    return store.chunks.filter((c) => c.userId === userId && c.subjectId === subjectId);
  }

  // Vector Similarity Search with cosine similarity & strict user isolation
  async searchSimilarChunks(
    userId: string,
    queryEmbedding: number[],
    options: {
      subjectId?: string;
      documentId?: string;
      limit?: number;
      threshold?: number;
    } = {}
  ): Promise<(DocumentChunk & { similarity: number })[]> {
    const { subjectId, documentId, limit = 5, threshold = 0.2 } = options;

    // Check if Supabase pgvector RPC is available
    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          const { data, error } = await supabase.rpc('match_document_chunks', {
            query_embedding: queryEmbedding,
            match_threshold: threshold,
            match_count: limit,
            filter_user_id: userId,
            filter_subject_id: subjectId || null,
            filter_document_id: documentId || null,
          });
          if (!error && data) {
            return data.map((d: any) => ({
              id: d.id,
              documentId: d.document_id,
              userId: d.user_id,
              subjectId: d.subject_id,
              chunkIndex: d.chunk_index,
              pageNumber: d.page_number,
              sectionTitle: d.section_title,
              content: d.content,
              similarity: d.similarity,
              createdAt: new Date().toISOString(),
            }));
          }
        } catch {
          // fallback to local calculation
        }
      }
    }

    // Local deterministic Cosine Similarity Calculation
    const store = this.loadStore();
    const eligible = store.chunks.filter((c) => {
      if (c.userId !== userId) return false;
      if (subjectId && c.subjectId !== subjectId) return false;
      if (documentId && c.documentId !== documentId) return false;
      return Boolean(c.embedding && c.embedding.length > 0);
    });

    const scored = eligible.map((chunk) => {
      const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding!);
      return { ...chunk, similarity };
    });

    return scored
      .filter((item) => item.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // --------------------------------------------------------------------------
  // TOPIC-CHUNK MAPPINGS
  // --------------------------------------------------------------------------

  async saveTopicChunkMappings(mappings: Omit<TopicChunkMapping, 'id' | 'createdAt'>[]): Promise<TopicChunkMapping[]> {
    const store = this.loadStore();
    const saved: TopicChunkMapping[] = [];

    for (const m of mappings) {
      const existing = store.topicChunkMappings.find(
        (x) => x.topicId === m.topicId && x.chunkId === m.chunkId
      );
      if (existing) {
        existing.relevanceScore = m.relevanceScore;
        existing.method = m.method;
        saved.push(existing);
      } else {
        const item: TopicChunkMapping = {
          ...m,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        };
        store.topicChunkMappings.push(item);
        saved.push(item);
      }
    }

    this.saveStore();
    return saved;
  }

  async getMappingsForTopic(topicId: string): Promise<(TopicChunkMapping & { chunk: DocumentChunk })[]> {
    const store = this.loadStore();
    const mappings = store.topicChunkMappings.filter((m) => m.topicId === topicId);
    return mappings
      .map((m) => {
        const chunk = store.chunks.find((c) => c.id === m.chunkId);
        if (!chunk) return null;
        return { ...m, chunk };
      })
      .filter(Boolean) as (TopicChunkMapping & { chunk: DocumentChunk })[];
  }

  // --------------------------------------------------------------------------
  // QUESTIONS & QUIZZES
  // --------------------------------------------------------------------------

  async saveQuestions(questions: Omit<GeneratedQuestion, 'id' | 'createdAt'>[]): Promise<GeneratedQuestion[]> {
    const store = this.loadStore();
    const saved: GeneratedQuestion[] = questions.map((q) => ({
      ...q,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }));
    store.questions.push(...saved);
    this.saveStore();
    return saved;
  }

  async getQuestionsByTopic(userId: string, topicId: string): Promise<GeneratedQuestion[]> {
    const store = this.loadStore();
    return store.questions.filter((q) => q.userId === userId && q.topicId === topicId);
  }

  async getQuestionById(userId: string, id: string): Promise<GeneratedQuestion | null> {
    const store = this.loadStore();
    return store.questions.find((q) => q.id === id && q.userId === userId) || null;
  }

  async createQuiz(
    userId: string,
    data: {
      subjectId: string;
      title: string;
      questionCount: number;
      topicIds: string[];
      questionIds: string[];
    }
  ): Promise<Quiz> {
    const store = this.loadStore();
    const quiz: Quiz = {
      id: crypto.randomUUID(),
      userId,
      subjectId: data.subjectId,
      title: data.title,
      questionCount: data.questionCount,
      status: 'ready',
      topicIds: data.topicIds,
      createdAt: new Date().toISOString(),
    };
    store.quizzes.push(quiz);
    this.saveStore();
    return quiz;
  }

  async getQuizById(userId: string, id: string): Promise<Quiz | null> {
    const store = this.loadStore();
    const quiz = store.quizzes.find((q) => q.id === id && q.userId === userId);
    if (!quiz) return null;

    // Attach questions (note: when serving to client, correct answers are stripped unless attempt is completed)
    const questions = store.questions.filter((q) => q.userId === userId && quiz.topicIds.includes(q.topicId));
    return {
      ...quiz,
      questions,
    };
  }

  // --------------------------------------------------------------------------
  // QUIZ ATTEMPTS & EVALUATIONS
  // --------------------------------------------------------------------------

  async createQuizAttempt(userId: string, quizId: string, subjectId: string): Promise<QuizAttempt> {
    const store = this.loadStore();
    const attempt: QuizAttempt = {
      id: crypto.randomUUID(),
      quizId,
      userId,
      subjectId,
      status: 'in_progress',
      totalScore: 0,
      maxScore: 0,
      percentage: 0,
      startedAt: new Date().toISOString(),
      completedAt: null,
    };
    store.quizAttempts.push(attempt);
    this.saveStore();
    return attempt;
  }

  async getAttemptById(userId: string, id: string): Promise<QuizAttempt | null> {
    const store = this.loadStore();
    const attempt = store.quizAttempts.find((a) => a.id === id && a.userId === userId);
    if (!attempt) return null;

    const answers = store.studentAnswers.filter((sa) => sa.attemptId === id);
    const answersWithEvals = answers.map((sa) => {
      const question = store.questions.find((q) => q.id === sa.questionId);
      const evaluation = store.evaluations.find((e) => e.studentAnswerId === sa.id);
      return {
        ...sa,
        question,
        evaluation,
      };
    });

    return {
      ...attempt,
      answers: answersWithEvals,
    };
  }

  async saveStudentAnswer(
    userId: string,
    attemptId: string,
    questionId: string,
    data: { selectedOption?: string; shortAnswerText?: string }
  ): Promise<StudentAnswer> {
    const store = this.loadStore();
    let answer = store.studentAnswers.find(
      (a) => a.attemptId === attemptId && a.questionId === questionId && a.userId === userId
    );

    if (answer) {
      answer.selectedOption = data.selectedOption;
      answer.shortAnswerText = data.shortAnswerText;
    } else {
      answer = {
        id: crypto.randomUUID(),
        attemptId,
        questionId,
        userId,
        selectedOption: data.selectedOption,
        shortAnswerText: data.shortAnswerText,
        createdAt: new Date().toISOString(),
      };
      store.studentAnswers.push(answer);
    }

    this.saveStore();
    return answer;
  }

  async saveEvaluation(
    evaluation: Omit<AnswerEvaluation, 'id' | 'createdAt'>
  ): Promise<AnswerEvaluation> {
    const store = this.loadStore();
    const saved: AnswerEvaluation = {
      ...evaluation,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    store.evaluations.push(saved);
    this.saveStore();
    return saved;
  }

  async completeQuizAttempt(
    userId: string,
    attemptId: string,
    totalScore: number,
    maxScore: number
  ): Promise<QuizAttempt | null> {
    const store = this.loadStore();
    const attempt = store.quizAttempts.find((a) => a.id === attemptId && a.userId === userId);
    if (!attempt) return null;

    attempt.status = 'completed';
    attempt.totalScore = totalScore;
    attempt.maxScore = maxScore;
    attempt.percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
    attempt.completedAt = new Date().toISOString();

    this.saveStore();
    return attempt;
  }

  async getAttemptsBySubject(userId: string, subjectId: string): Promise<QuizAttempt[]> {
    const store = this.loadStore();
    return store.quizAttempts
      .filter((a) => a.userId === userId && a.subjectId === subjectId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  // --------------------------------------------------------------------------
  // TOPIC MASTERY SNAPSHOTS (GAP ENGINE)
  // --------------------------------------------------------------------------

  async getMasterySnapshots(userId: string, subjectId: string): Promise<TopicMasterySnapshot[]> {
    const store = this.loadStore();
    return store.masterySnapshots
      .filter((m) => m.userId === userId && m.subjectId === subjectId)
      .map((m) => {
        const topic = store.topics.find((t) => t.id === m.topicId);
        return {
          ...m,
          topicName: topic?.name || 'Unknown Topic',
        };
      });
  }

  async saveMasterySnapshot(
    snapshot: Omit<TopicMasterySnapshot, 'id' | 'calculatedAt'>
  ): Promise<TopicMasterySnapshot> {
    const store = this.loadStore();
    const existingIdx = store.masterySnapshots.findIndex(
      (m) => m.userId === snapshot.userId && m.topicId === snapshot.topicId
    );

    const saved: TopicMasterySnapshot = {
      ...snapshot,
      id: crypto.randomUUID(),
      calculatedAt: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      store.masterySnapshots[existingIdx] = saved;
    } else {
      store.masterySnapshots.push(saved);
    }

    this.saveStore();
    return saved;
  }

  // --------------------------------------------------------------------------
  // REVISION PLANS
  // --------------------------------------------------------------------------

  async getActiveRevisionPlan(userId: string, subjectId: string): Promise<RevisionPlan | null> {
    const store = this.loadStore();
    const plan = store.revisionPlans.find(
      (p) => p.userId === userId && p.subjectId === subjectId && p.status === 'active'
    );
    if (!plan) return null;

    const items = store.revisionPlanItems
      .filter((i) => i.revisionPlanId === plan.id)
      .map((item) => {
        const topic = store.topics.find((t) => t.id === item.topicId);
        return {
          ...item,
          topicName: topic?.name || 'Unknown Topic',
        };
      })
      .sort((a, b) => a.orderIndex - b.orderIndex);

    return { ...plan, items };
  }

  async saveRevisionPlan(
    plan: Omit<RevisionPlan, 'id' | 'createdAt' | 'updatedAt' | 'items'>,
    items: Omit<RevisionPlanItem, 'id' | 'revisionPlanId'>[]
  ): Promise<RevisionPlan> {
    const store = this.loadStore();

    // Mark previous active plans as archived
    store.revisionPlans
      .filter((p) => p.userId === plan.userId && p.subjectId === plan.subjectId && p.status === 'active')
      .forEach((p) => {
        p.status = 'archived';
        p.updatedAt = new Date().toISOString();
      });

    const newPlanId = crypto.randomUUID();
    const newPlan: RevisionPlan = {
      ...plan,
      id: newPlanId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.revisionPlans.push(newPlan);

    const savedItems: RevisionPlanItem[] = items.map((item, idx) => ({
      ...item,
      id: crypto.randomUUID(),
      revisionPlanId: newPlanId,
      orderIndex: item.orderIndex ?? idx,
    }));
    store.revisionPlanItems.push(...savedItems);

    this.saveStore();
    return { ...newPlan, items: savedItems };
  }

  async updateRevisionPlanItemStatus(
    userId: string,
    itemId: string,
    status: 'pending' | 'completed' | 'skipped'
  ): Promise<RevisionPlanItem | null> {
    const store = this.loadStore();
    const item = store.revisionPlanItems.find((i) => i.id === itemId);
    if (!item) return null;

    item.status = status;
    item.completedAt = status === 'completed' ? new Date().toISOString() : null;
    this.saveStore();
    return item;
  }

  // --------------------------------------------------------------------------
  // TOPIC ASSISTANT CHAT
  // --------------------------------------------------------------------------

  async getChatSessions(userId: string, subjectId: string): Promise<ChatSession[]> {
    const store = this.loadStore();
    return store.chatSessions
      .filter((s) => s.userId === userId && s.subjectId === subjectId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createChatSession(
    userId: string,
    subjectId: string,
    title: string,
    topicId?: string
  ): Promise<ChatSession> {
    const store = this.loadStore();
    const session: ChatSession = {
      id: crypto.randomUUID(),
      userId,
      subjectId,
      topicId: topicId || null,
      title,
      createdAt: new Date().toISOString(),
    };
    store.chatSessions.push(session);
    this.saveStore();
    return session;
  }

  async getChatMessages(userId: string, sessionId: string): Promise<ChatMessage[]> {
    const store = this.loadStore();
    return store.chatMessages
      .filter((m) => m.sessionId === sessionId && m.userId === userId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async addChatMessage(
    userId: string,
    sessionId: string,
    message: Omit<ChatMessage, 'id' | 'userId' | 'sessionId' | 'createdAt'>
  ): Promise<ChatMessage> {
    const store = this.loadStore();
    const msg: ChatMessage = {
      ...message,
      id: crypto.randomUUID(),
      userId,
      sessionId,
      createdAt: new Date().toISOString(),
    };
    store.chatMessages.push(msg);
    this.saveStore();
    return msg;
  }
}

export const repository = new Repository();
