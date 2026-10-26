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

    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          const { data: result, error } = await supabase
            .from('subjects')
            .insert({
              id: subject.id,
              user_id: userId,
              name: data.name,
              code: data.code || null,
              description: data.description || null,
            })
            .select()
            .single();
          if (!error && result) {
            subject.id = result.id;
            subject.createdAt = result.created_at;
            subject.updatedAt = result.updated_at;
            this.saveStore();
          }
        } catch (err) {
          console.warn('Failed to insert subject into Supabase:', err);
        }
      }
    }

    return subject;
  }

  async deleteSubject(userId: string, id: string): Promise<boolean> {
    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        const { error } = await supabase
          .from('subjects')
          .delete()
          .eq('id', id)
          .eq('user_id', userId);
        if (!error) {
          // Cascade handles dependent rows in Supabase
          const store = this.loadStore();
          store.subjects = store.subjects.filter((s) => !(s.id === id && s.userId === userId));
          store.topics = store.topics.filter((t) => t.subjectId !== id);
          store.documents = store.documents.filter((d) => d.subjectId !== id);
          store.chunks = store.chunks.filter((c) => c.subjectId !== id);
          this.saveStore();
          return true;
        }
      }
    }

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
    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase
          .from('topics')
          .select('*')
          .eq('user_id', userId)
          .eq('subject_id', subjectId)
          .order('order_index', { ascending: true });
        if (!error && data) {
          return data.map((d: any) => ({
            id: d.id,
            subjectId: d.subject_id,
            userId: d.user_id,
            parentId: d.parent_id,
            name: d.name,
            code: d.code,
            level: d.level,
            description: d.description,
            weight: parseFloat(d.weight) || 1.0,
            orderIndex: d.order_index,
            createdAt: d.created_at,
          }));
        }
      }
    }

    const store = this.loadStore();
    return store.topics
      .filter((t) => t.userId === userId && t.subjectId === subjectId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async getTopicById(userId: string, id: string): Promise<Topic | null> {
    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase
          .from('topics')
          .select('*')
          .eq('id', id)
          .eq('user_id', userId)
          .single();
        if (!error && data) {
          return {
            id: data.id,
            subjectId: data.subject_id,
            userId: data.user_id,
            parentId: data.parent_id,
            name: data.name,
            code: data.code,
            level: data.level,
            description: data.description,
            weight: parseFloat(data.weight) || 1.0,
            orderIndex: data.order_index,
            createdAt: data.created_at,
          };
        }
      }
    }

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

    // Persist to Supabase
    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          // Delete existing topics for this subject in Supabase
          await supabase
            .from('topics')
            .delete()
            .eq('user_id', userId)
            .eq('subject_id', subjectId);

          // Insert new topics — must respect parent FK: insert parents (null parentId) first
          const withoutParent = saved.filter((t) => !t.parentId);
          const withParent = saved.filter((t) => t.parentId);

          if (withoutParent.length > 0) {
            await supabase.from('topics').insert(
              withoutParent.map((t) => ({
                id: t.id,
                subject_id: t.subjectId,
                user_id: t.userId,
                parent_id: null,
                name: t.name,
                code: t.code || null,
                level: t.level,
                description: t.description || null,
                weight: t.weight,
                order_index: t.orderIndex,
              }))
            );
          }

          if (withParent.length > 0) {
            await supabase.from('topics').insert(
              withParent.map((t) => ({
                id: t.id,
                subject_id: t.subjectId,
                user_id: t.userId,
                parent_id: t.parentId,
                name: t.name,
                code: t.code || null,
                level: t.level,
                description: t.description || null,
                weight: t.weight,
                order_index: t.orderIndex,
              }))
            );
          }
        } catch (err) {
          console.warn('Failed to save topics to Supabase:', err);
        }
      }
    }

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

    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          await supabase.from('topics').insert({
            id: topic.id,
            subject_id: topic.subjectId,
            user_id: topic.userId,
            parent_id: topic.parentId || null,
            name: topic.name,
            code: topic.code || null,
            level: topic.level,
            description: topic.description || null,
            weight: topic.weight,
            order_index: topic.orderIndex,
          });
        } catch (err) {
          console.warn('Failed to insert topic into Supabase:', err);
        }
      }
    }

    return topic;
  }

  async updateTopic(userId: string, id: string, updates: Partial<Topic>): Promise<Topic | null> {
    const store = this.loadStore();
    const topic = store.topics.find((t) => t.id === id && t.userId === userId);
    if (!topic) return null;
    Object.assign(topic, updates);
    this.saveStore();

    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          const dbUpdates: any = {};
          if (updates.name !== undefined) dbUpdates.name = updates.name;
          if (updates.code !== undefined) dbUpdates.code = updates.code;
          if (updates.level !== undefined) dbUpdates.level = updates.level;
          if (updates.description !== undefined) dbUpdates.description = updates.description;
          if (updates.weight !== undefined) dbUpdates.weight = updates.weight;
          if (updates.orderIndex !== undefined) dbUpdates.order_index = updates.orderIndex;
          if (updates.parentId !== undefined) dbUpdates.parent_id = updates.parentId;
          if (Object.keys(dbUpdates).length > 0) {
            await supabase.from('topics').update(dbUpdates).eq('id', id).eq('user_id', userId);
          }
        } catch (err) {
          console.warn('Failed to update topic in Supabase:', err);
        }
      }
    }

    return topic;
  }

  async deleteTopic(userId: string, id: string): Promise<boolean> {
    const store = this.loadStore();
    const idx = store.topics.findIndex((t) => t.id === id && t.userId === userId);
    if (idx === -1) return false;
    store.topics.splice(idx, 1);
    store.topicChunkMappings = store.topicChunkMappings.filter((m) => m.topicId !== id);
    this.saveStore();

    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          await supabase.from('topics').delete().eq('id', id).eq('user_id', userId);
        } catch (err) {
          console.warn('Failed to delete topic from Supabase:', err);
        }
      }
    }

    return true;
  }

  // --------------------------------------------------------------------------
  // DOCUMENTS & CHUNKS (RAG INDEXING)
  // --------------------------------------------------------------------------

  async getDocuments(userId: string, subjectId?: string): Promise<DocumentRecord[]> {
    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        let query = supabase
          .from('documents')
          .select('*')
          .eq('user_id', userId);
        if (subjectId) {
          query = query.eq('subject_id', subjectId);
        }
        const { data, error } = await query.order('created_at', { ascending: false });
        if (!error && data) {
          return data.map((d: any) => ({
            id: d.id,
            userId: d.user_id,
            subjectId: d.subject_id,
            title: d.title,
            filename: d.filename,
            fileType: d.file_type,
            fileSize: d.file_size,
            storagePath: d.storage_path,
            status: d.status,
            errorMessage: d.error_message,
            chunkCount: d.chunk_count,
            createdAt: d.created_at,
            updatedAt: d.updated_at,
          }));
        }
      }
    }

    const store = this.loadStore();
    return store.documents
      .filter((d) => d.userId === userId && (!subjectId || d.subjectId === subjectId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getDocumentById(userId: string, id: string): Promise<DocumentRecord | null> {
    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .eq('id', id)
          .eq('user_id', userId)
          .single();
        if (!error && data) {
          return {
            id: data.id,
            userId: data.user_id,
            subjectId: data.subject_id,
            title: data.title,
            filename: data.filename,
            fileType: data.file_type,
            fileSize: data.file_size,
            storagePath: data.storage_path,
            status: data.status,
            errorMessage: data.error_message,
            chunkCount: data.chunk_count,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          };
        }
      }
    }

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

    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          await supabase.from('documents').insert({
            id: doc.id,
            user_id: doc.userId,
            subject_id: doc.subjectId || null,
            title: doc.title,
            filename: doc.filename,
            file_type: doc.fileType,
            file_size: doc.fileSize,
            storage_path: doc.storagePath || null,
            status: doc.status,
            error_message: doc.errorMessage || null,
            chunk_count: doc.chunkCount,
          });
        } catch (err) {
          console.warn('Failed to insert document into Supabase:', err);
        }
      }
    }

    return doc;
  }

  async updateDocument(userId: string, id: string, updates: Partial<DocumentRecord>): Promise<DocumentRecord | null> {
    const store = this.loadStore();
    const doc = store.documents.find((d) => d.id === id && d.userId === userId);
    if (!doc) return null;
    Object.assign(doc, updates, { updatedAt: new Date().toISOString() });
    this.saveStore();

    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          const dbUpdates: any = { updated_at: new Date().toISOString() };
          if (updates.title !== undefined) dbUpdates.title = updates.title;
          if (updates.status !== undefined) dbUpdates.status = updates.status;
          if (updates.errorMessage !== undefined) dbUpdates.error_message = updates.errorMessage;
          if (updates.chunkCount !== undefined) dbUpdates.chunk_count = updates.chunkCount;
          await supabase.from('documents').update(dbUpdates).eq('id', id).eq('user_id', userId);
        } catch (err) {
          console.warn('Failed to update document in Supabase:', err);
        }
      }
    }

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

    // Persist chunks to Supabase
    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          // Insert chunks in batches of 50 to avoid request size limits
          const BATCH_SIZE = 50;
          for (let i = 0; i < saved.length; i += BATCH_SIZE) {
            const batch = saved.slice(i, i + BATCH_SIZE);
            await supabase.from('document_chunks').insert(
              batch.map((c) => ({
                id: c.id,
                document_id: c.documentId,
                user_id: c.userId,
                subject_id: c.subjectId || null,
                chunk_index: c.chunkIndex,
                page_number: c.pageNumber || null,
                section_title: c.sectionTitle || null,
                content: c.content,
                token_count: c.tokenCount || null,
                embedding: c.embedding && c.embedding.length > 0 ? JSON.stringify(c.embedding) : null,
              }))
            );
          }

          // Update document chunk_count and status in Supabase
          if (saved.length > 0) {
            const docId = saved[0].documentId;
            const userId = saved[0].userId;
            const doc = store.documents.find((d) => d.id === docId);
            if (doc) {
              await supabase.from('documents').update({
                chunk_count: doc.chunkCount,
                status: 'indexed',
                updated_at: new Date().toISOString(),
              }).eq('id', docId).eq('user_id', userId);
            }
          }
        } catch (err) {
          console.warn('Failed to save chunks to Supabase:', err);
        }
      }
    }

    return saved;
  }

  async getChunksByDocumentId(userId: string, documentId: string): Promise<DocumentChunk[]> {
    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase
          .from('document_chunks')
          .select('*')
          .eq('user_id', userId)
          .eq('document_id', documentId)
          .order('chunk_index', { ascending: true });
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
            tokenCount: d.token_count,
            embedding: d.embedding,
            createdAt: d.created_at,
          }));
        }
      }
    }

    const store = this.loadStore();
    return store.chunks
      .filter((c) => c.userId === userId && c.documentId === documentId)
      .sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  async getChunksBySubjectId(userId: string, subjectId: string): Promise<DocumentChunk[]> {
    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase
          .from('document_chunks')
          .select('*')
          .eq('user_id', userId)
          .eq('subject_id', subjectId);
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
            tokenCount: d.token_count,
            embedding: d.embedding,
            createdAt: d.created_at,
          }));
        }
      }
    }

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

    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          const rows = saved.map((m) => ({
            id: m.id,
            topic_id: m.topicId,
            chunk_id: m.chunkId,
            relevance_score: m.relevanceScore,
            method: m.method,
          }));
          await supabase.from('topic_chunk_mappings').upsert(rows, { onConflict: 'topic_id,chunk_id' });
        } catch (err) {
          console.warn('Failed to save topic chunk mappings to Supabase:', err);
        }
      }
    }

    return saved;
  }

  async getMappingsForTopic(topicId: string): Promise<(TopicChunkMapping & { chunk: DocumentChunk })[]> {
    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('topic_chunk_mappings')
            .select(`
              id,
              topic_id,
              chunk_id,
              relevance_score,
              method,
              created_at,
              document_chunks (
                id,
                document_id,
                user_id,
                subject_id,
                chunk_index,
                page_number,
                section_title,
                content,
                token_count,
                created_at
              )
            `)
            .eq('topic_id', topicId);
          if (!error && data && data.length > 0) {
            return data
              .filter((d: any) => d.document_chunks)
              .map((d: any) => {
                const c = d.document_chunks;
                return {
                  id: d.id,
                  topicId: d.topic_id,
                  chunkId: d.chunk_id,
                  relevanceScore: parseFloat(d.relevance_score),
                  method: d.method,
                  createdAt: d.created_at,
                  chunk: {
                    id: c.id,
                    documentId: c.document_id,
                    userId: c.user_id,
                    subjectId: c.subject_id,
                    chunkIndex: c.chunk_index,
                    pageNumber: c.page_number,
                    sectionTitle: c.section_title,
                    content: c.content,
                    tokenCount: c.token_count,
                    createdAt: c.created_at,
                  },
                };
              });
          }
        } catch {
          // fallback to local
        }
      }
    }

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

  async saveQuestions(
    questions: (Omit<GeneratedQuestion, 'id' | 'createdAt'> & { id?: string; createdAt?: string })[]
  ): Promise<GeneratedQuestion[]> {
    const store = this.loadStore();
    const saved: GeneratedQuestion[] = questions.map((q) => ({
      ...q,
      id: q.id || crypto.randomUUID(),
      createdAt: q.createdAt || new Date().toISOString(),
    }));
    store.questions.push(...saved);
    this.saveStore();

    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          const rows = saved.map((q) => ({
            id: q.id,
            user_id: q.userId,
            subject_id: q.subjectId,
            topic_id: q.topicId,
            question_text: q.questionText,
            question_type: q.questionType,
            difficulty: q.difficulty,
            options: q.options,
            correct_answer: q.correctAnswer,
            rubric: q.rubric,
            explanation: q.explanation,
            citation_metadata: q.citationMetadata || [],
            is_flagged: q.isFlagged || false,
          }));
          await supabase.from('generated_questions').insert(rows);
        } catch (err) {
          console.warn('Failed to insert questions into Supabase:', err);
        }
      }
    }

    return saved;
  }

  async getQuestionsByTopic(userId: string, topicId: string): Promise<GeneratedQuestion[]> {
    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('generated_questions')
            .select('*')
            .eq('user_id', userId)
            .eq('topic_id', topicId);
          if (!error && data && data.length > 0) {
            return data.map((q: any) => ({
              id: q.id,
              userId: q.user_id,
              subjectId: q.subject_id,
              topicId: q.topic_id,
              questionText: q.question_text,
              questionType: q.question_type,
              difficulty: q.difficulty,
              options: q.options,
              correctAnswer: q.correct_answer,
              rubric: q.rubric,
              explanation: q.explanation,
              citationMetadata: q.citation_metadata || [],
              isFlagged: q.is_flagged,
              createdAt: q.created_at,
            }));
          }
        } catch {
          // fallback to local
        }
      }
    }

    const store = this.loadStore();
    return store.questions.filter((q) => q.userId === userId && q.topicId === topicId);
  }

  async getQuestionById(userId: string, id: string): Promise<GeneratedQuestion | null> {
    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('generated_questions')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();
          if (!error && data) {
            return {
              id: data.id,
              userId: data.user_id,
              subjectId: data.subject_id,
              topicId: data.topic_id,
              questionText: data.question_text,
              questionType: data.question_type,
              difficulty: data.difficulty,
              options: data.options,
              correctAnswer: data.correct_answer,
              rubric: data.rubric,
              explanation: data.explanation,
              citationMetadata: data.citation_metadata || [],
              isFlagged: data.is_flagged,
              createdAt: data.created_at,
            };
          }
        } catch {
          // fallback to local
        }
      }
    }

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
      questionIds: data.questionIds,
      createdAt: new Date().toISOString(),
    };
    store.quizzes.push(quiz);
    this.saveStore();

    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          await supabase.from('quizzes').insert({
            id: quiz.id,
            user_id: userId,
            subject_id: data.subjectId,
            title: data.title,
            question_count: data.questionCount,
            status: 'ready',
          });

          if (data.questionIds && data.questionIds.length > 0) {
            const linkRows = data.questionIds.map((qid, idx) => ({
              quiz_id: quiz.id,
              question_id: qid,
              order_index: idx,
            }));
            await supabase.from('quiz_questions').insert(linkRows);
          }
        } catch (err) {
          console.warn('Failed to insert quiz into Supabase:', err);
        }
      }
    }

    return quiz;
  }

  async getQuizById(userId: string, id: string): Promise<Quiz | null> {
    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          const { data: dbQuiz } = await supabase
            .from('quizzes')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

          if (dbQuiz) {
            const { data: links } = await supabase
              .from('quiz_questions')
              .select('question_id, order_index')
              .eq('quiz_id', id)
              .order('order_index', { ascending: true });

            const questionIds = (links || []).map((l: any) => l.question_id);
            let questions: GeneratedQuestion[] = [];

            if (questionIds.length > 0) {
              const { data: qRows } = await supabase
                .from('generated_questions')
                .select('*')
                .in('id', questionIds)
                .eq('user_id', userId);

              if (qRows) {
                const qMap = new Map(
                  qRows.map((q: any) => [
                    q.id,
                    {
                      id: q.id,
                      userId: q.user_id,
                      subjectId: q.subject_id,
                      topicId: q.topic_id,
                      questionText: q.question_text,
                      questionType: q.question_type,
                      difficulty: q.difficulty,
                      options: q.options,
                      correctAnswer: q.correct_answer,
                      rubric: q.rubric,
                      explanation: q.explanation,
                      citationMetadata: q.citation_metadata || [],
                      isFlagged: q.is_flagged,
                      createdAt: q.created_at,
                    },
                  ])
                );
                questions = questionIds.map((qid: string) => qMap.get(qid)).filter(Boolean) as GeneratedQuestion[];
              }
            }

            return {
              id: dbQuiz.id,
              userId: dbQuiz.user_id,
              subjectId: dbQuiz.subject_id,
              title: dbQuiz.title,
              questionCount: dbQuiz.question_count,
              status: dbQuiz.status,
              topicIds: [],
              questionIds,
              createdAt: dbQuiz.created_at,
              questions,
            };
          }
        } catch {
          // fallback to local store
        }
      }
    }

    const store = this.loadStore();
    const quiz = store.quizzes.find((q) => q.id === id && q.userId === userId);
    if (!quiz) return null;

    // Attach questions: prefer exact questionIds if available, otherwise fallback to topic-based filter
    let questions: GeneratedQuestion[] = [];
    if (quiz.questionIds && quiz.questionIds.length > 0) {
      questions = quiz.questionIds
        .map((qid) => store.questions.find((q) => q.id === qid && q.userId === userId))
        .filter((q): q is GeneratedQuestion => Boolean(q));
    }
    if (questions.length === 0) {
      questions = store.questions
        .filter((q) => q.userId === userId && quiz.topicIds.includes(q.topicId))
        .slice(0, quiz.questionCount);
    }

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

    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          await supabase.from('quiz_attempts').insert({
            id: attempt.id,
            quiz_id: quizId,
            user_id: userId,
            subject_id: subjectId,
            status: 'in_progress',
            total_score: 0,
            max_score: 0,
            percentage: 0,
            started_at: attempt.startedAt,
          });
        } catch (err) {
          console.warn('Failed to insert quiz attempt into Supabase:', err);
        }
      }
    }

    return attempt;
  }

  async getAttemptById(userId: string, id: string): Promise<QuizAttempt | null> {
    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          const { data: dbAttempt, error } = await supabase
            .from('quiz_attempts')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

          if (!error && dbAttempt) {
            const { data: dbAnswers } = await supabase
              .from('student_answers')
              .select('*')
              .eq('attempt_id', id)
              .eq('user_id', userId);

            const answers = dbAnswers || [];
            const answerIds = answers.map((a: any) => a.id);
            const questionIds = answers.map((a: any) => a.question_id);

            let evals: any[] = [];
            if (answerIds.length > 0) {
              const { data: dbEvals } = await supabase
                .from('answer_evaluations')
                .select('*')
                .in('student_answer_id', answerIds);
              evals = dbEvals || [];
            }

            let questions: any[] = [];
            if (questionIds.length > 0) {
              const { data: dbQuestions } = await supabase
                .from('generated_questions')
                .select('*')
                .in('id', questionIds);
              questions = dbQuestions || [];
            }

            const evalMap = new Map(evals.map((e: any) => [e.student_answer_id, e]));
            const qMap = new Map(questions.map((q: any) => [q.id, q]));

            const answersWithDetails = answers.map((a: any) => {
              const q = qMap.get(a.question_id);
              const e = evalMap.get(a.id);
              return {
                id: a.id,
                attemptId: a.attempt_id,
                questionId: a.question_id,
                userId: a.user_id,
                selectedOption: a.selected_option,
                shortAnswerText: a.short_answer_text,
                createdAt: a.created_at,
                question: q
                  ? {
                      id: q.id,
                      userId: q.user_id,
                      subjectId: q.subject_id,
                      topicId: q.topic_id,
                      questionText: q.question_text,
                      questionType: q.question_type,
                      difficulty: q.difficulty,
                      options: q.options,
                      correctAnswer: q.correct_answer,
                      rubric: q.rubric,
                      explanation: q.explanation,
                      citationMetadata: q.citation_metadata || [],
                      isFlagged: q.is_flagged,
                      createdAt: q.created_at,
                    }
                  : undefined,
                evaluation: e
                  ? {
                      id: e.id,
                      studentAnswerId: e.student_answer_id,
                      correctness: e.correctness,
                      score: parseFloat(e.score),
                      keyConceptsIdentified: e.key_concepts_identified || [],
                      missingConcepts: e.missing_concepts || [],
                      incorrectClaims: e.incorrect_claims || [],
                      explanation: e.explanation,
                      confidence: parseFloat(e.confidence),
                      createdAt: e.created_at,
                    }
                  : undefined,
              };
            });

            return {
              id: dbAttempt.id,
              quizId: dbAttempt.quiz_id,
              userId: dbAttempt.user_id,
              subjectId: dbAttempt.subject_id,
              status: dbAttempt.status,
              totalScore: parseFloat(dbAttempt.total_score) || 0,
              maxScore: parseFloat(dbAttempt.max_score) || 0,
              percentage: parseFloat(dbAttempt.percentage) || 0,
              startedAt: dbAttempt.started_at,
              completedAt: dbAttempt.completed_at,
              answers: answersWithDetails,
            };
          }
        } catch {
          // fallback to local
        }
      }
    }

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

    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          await supabase.from('student_answers').upsert(
            {
              id: answer.id,
              attempt_id: attemptId,
              question_id: questionId,
              user_id: userId,
              selected_option: data.selectedOption || null,
              short_answer_text: data.shortAnswerText || null,
            },
            { onConflict: 'attempt_id,question_id' }
          );
        } catch (err) {
          console.warn('Failed to upsert student answer in Supabase:', err);
        }
      }
    }

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

    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          await supabase.from('answer_evaluations').insert({
            id: saved.id,
            student_answer_id: saved.studentAnswerId,
            correctness: saved.correctness,
            score: saved.score,
            key_concepts_identified: saved.keyConceptsIdentified || [],
            missing_concepts: saved.missingConcepts || [],
            incorrect_claims: saved.incorrectClaims || [],
            explanation: saved.explanation,
            confidence: saved.confidence ?? 1.0,
          });
        } catch (err) {
          console.warn('Failed to save evaluation to Supabase:', err);
        }
      }
    }

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

    const completedAt = new Date().toISOString();
    const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

    attempt.status = 'completed';
    attempt.totalScore = totalScore;
    attempt.maxScore = maxScore;
    attempt.percentage = percentage;
    attempt.completedAt = completedAt;

    this.saveStore();

    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          await supabase
            .from('quiz_attempts')
            .update({
              status: 'completed',
              total_score: totalScore,
              max_score: maxScore,
              percentage,
              completed_at: completedAt,
            })
            .eq('id', attemptId)
            .eq('user_id', userId);
        } catch (err) {
          console.warn('Failed to complete quiz attempt in Supabase:', err);
        }
      }
    }

    return attempt;
  }

  async getAttemptsBySubject(userId: string, subjectId: string): Promise<QuizAttempt[]> {
    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('quiz_attempts')
            .select('*')
            .eq('user_id', userId)
            .eq('subject_id', subjectId)
            .order('started_at', { ascending: false });
          if (!error && data && data.length > 0) {
            return data.map((d: any) => ({
              id: d.id,
              quizId: d.quiz_id,
              userId: d.user_id,
              subjectId: d.subject_id,
              status: d.status,
              totalScore: parseFloat(d.total_score) || 0,
              maxScore: parseFloat(d.max_score) || 0,
              percentage: parseFloat(d.percentage) || 0,
              startedAt: d.started_at,
              completedAt: d.completed_at,
            }));
          }
        } catch {
          // fallback to local
        }
      }
    }

    const store = this.loadStore();
    return store.quizAttempts
      .filter((a) => a.userId === userId && a.subjectId === subjectId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  // --------------------------------------------------------------------------
  // TOPIC MASTERY SNAPSHOTS (GAP ENGINE)
  // --------------------------------------------------------------------------

  async getMasterySnapshots(userId: string, subjectId: string): Promise<TopicMasterySnapshot[]> {
    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('topic_mastery_snapshots')
            .select(`
              *,
              topics (name)
            `)
            .eq('user_id', userId)
            .eq('subject_id', subjectId);
          if (!error && data && data.length > 0) {
            return data.map((d: any) => ({
              id: d.id,
              userId: d.user_id,
              subjectId: d.subject_id,
              topicId: d.topic_id,
              topicName: d.topics?.name || 'Unknown Topic',
              masteryScore: parseFloat(d.mastery_score) || 0,
              status: d.status,
              questionsAttempted: d.questions_attempted || 0,
              correctCount: d.correct_count || 0,
              incorrectCount: d.incorrect_count || 0,
              confidence: parseFloat(d.confidence) || 0,
              keyGaps: d.key_gaps || [],
              lastAssessmentAt: d.last_assessment_at,
              calculatedAt: d.calculated_at,
            }));
          }
        } catch {
          // fallback to local
        }
      }
    }

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

    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          await supabase.from('topic_mastery_snapshots').upsert(
            {
              id: saved.id,
              user_id: snapshot.userId,
              subject_id: snapshot.subjectId,
              topic_id: snapshot.topicId,
              mastery_score: snapshot.masteryScore,
              status: snapshot.status,
              questions_attempted: snapshot.questionsAttempted,
              correct_count: snapshot.correctCount,
              incorrect_count: snapshot.incorrectCount,
              confidence: snapshot.confidence,
              key_gaps: snapshot.keyGaps || [],
              last_assessment_at: snapshot.lastAssessmentAt || new Date().toISOString(),
              calculated_at: saved.calculatedAt,
            },
            { onConflict: 'user_id,topic_id' }
          );
        } catch (err) {
          console.warn('Failed to upsert mastery snapshot to Supabase:', err);
        }
      }
    }

    return saved;
  }

  // --------------------------------------------------------------------------
  // REVISION PLANS
  // --------------------------------------------------------------------------

  async getActiveRevisionPlan(userId: string, subjectId: string): Promise<RevisionPlan | null> {
    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          const { data: dbPlan, error } = await supabase
            .from('revision_plans')
            .select('*')
            .eq('user_id', userId)
            .eq('subject_id', subjectId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!error && dbPlan) {
            const { data: dbItems } = await supabase
              .from('revision_plan_items')
              .select(`
                *,
                topics (name)
              `)
              .eq('revision_plan_id', dbPlan.id)
              .order('order_index', { ascending: true });

            const items = (dbItems || []).map((i: any) => ({
              id: i.id,
              revisionPlanId: i.revision_plan_id,
              topicId: i.topic_id,
              topicName: i.topics?.name || 'Unknown Topic',
              priority: i.priority,
              recommendedActivity: i.recommendedActivity || i.recommended_activity,
              estimatedMinutes: i.estimatedMinutes || i.estimated_minutes,
              targetDate: i.targetDate || i.target_date,
              reason: i.reason,
              status: i.status,
              completedAt: i.completed_at,
              orderIndex: i.order_index,
            }));

            return {
              id: dbPlan.id,
              userId: dbPlan.user_id,
              subjectId: dbPlan.subject_id,
              targetExamDate: dbPlan.target_exam_date,
              dailyStudyMinutes: dbPlan.daily_study_minutes,
              availableDays: dbPlan.available_days || [],
              sessionDurationMinutes: dbPlan.session_duration_minutes,
              status: dbPlan.status,
              createdAt: dbPlan.created_at,
              updatedAt: dbPlan.updated_at,
              items,
            };
          }
        } catch {
          // fallback to local
        }
      }
    }

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

    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          await supabase
            .from('revision_plans')
            .update({ status: 'archived', updated_at: new Date().toISOString() })
            .eq('user_id', plan.userId)
            .eq('subject_id', plan.subjectId)
            .eq('status', 'active');

          await supabase.from('revision_plans').insert({
            id: newPlan.id,
            user_id: plan.userId,
            subject_id: plan.subjectId,
            target_exam_date: plan.targetExamDate,
            daily_study_minutes: plan.dailyStudyMinutes,
            available_days: plan.availableDays,
            session_duration_minutes: plan.sessionDurationMinutes,
            status: 'active',
          });

          if (savedItems.length > 0) {
            await supabase.from('revision_plan_items').insert(
              savedItems.map((item) => ({
                id: item.id,
                revision_plan_id: newPlan.id,
                topic_id: item.topicId,
                priority: item.priority,
                recommended_activity: item.recommendedActivity,
                estimated_minutes: item.estimatedMinutes,
                target_date: item.targetDate,
                reason: item.reason,
                status: item.status || 'pending',
                order_index: item.orderIndex,
              }))
            );
          }
        } catch (err) {
          console.warn('Failed to save revision plan to Supabase:', err);
        }
      }
    }

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

    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          await supabase
            .from('revision_plan_items')
            .update({
              status,
              completed_at: item.completedAt,
            })
            .eq('id', itemId);
        } catch (err) {
          console.warn('Failed to update revision plan item in Supabase:', err);
        }
      }
    }

    return item;
  }

  // --------------------------------------------------------------------------
  // TOPIC ASSISTANT CHAT
  // --------------------------------------------------------------------------

  async getChatSessions(userId: string, subjectId: string): Promise<ChatSession[]> {
    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('chat_sessions')
            .select('*')
            .eq('user_id', userId)
            .eq('subject_id', subjectId)
            .order('created_at', { ascending: false });
          if (!error && data && data.length > 0) {
            return data.map((s: any) => ({
              id: s.id,
              userId: s.user_id,
              subjectId: s.subject_id,
              topicId: s.topic_id,
              title: s.title,
              createdAt: s.created_at,
            }));
          }
        } catch {
          // fallback to local
        }
      }
    }

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

    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          await supabase.from('chat_sessions').insert({
            id: session.id,
            user_id: userId,
            subject_id: subjectId,
            topic_id: topicId || null,
            title,
          });
        } catch (err) {
          console.warn('Failed to insert chat session into Supabase:', err);
        }
      }
    }

    return session;
  }

  async getChatMessages(userId: string, sessionId: string): Promise<ChatMessage[]> {
    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('session_id', sessionId)
            .eq('user_id', userId)
            .order('created_at', { ascending: true });
          if (!error && data && data.length > 0) {
            return data.map((m: any) => ({
              id: m.id,
              sessionId: m.session_id,
              userId: m.user_id,
              role: m.role,
              content: m.content,
              citations: m.citations || [],
              isGrounded: m.is_grounded,
              createdAt: m.created_at,
            }));
          }
        } catch {
          // fallback to local
        }
      }
    }

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

    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          await supabase.from('chat_messages').insert({
            id: msg.id,
            session_id: sessionId,
            user_id: userId,
            role: msg.role,
            content: msg.content,
            citations: msg.citations || [],
            is_grounded: msg.isGrounded !== false,
          });
        } catch (err) {
          console.warn('Failed to insert chat message into Supabase:', err);
        }
      }
    }

    return msg;
  }

  // --------------------------------------------------------------------------
  // SYLLABUS DOCUMENTS
  // --------------------------------------------------------------------------

  async saveSyllabusDocument(
    userId: string,
    subjectId: string,
    data: { filename: string; rawText: string; filePath?: string }
  ): Promise<SyllabusDocument> {
    const store = this.loadStore();
    const doc: SyllabusDocument = {
      id: crypto.randomUUID(),
      subjectId,
      userId,
      filename: data.filename,
      filePath: data.filePath,
      rawText: data.rawText,
      parsedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    store.syllabusDocuments = store.syllabusDocuments.filter(
      (d) => !(d.userId === userId && d.subjectId === subjectId)
    );
    store.syllabusDocuments.push(doc);
    this.saveStore();

    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          await supabase.from('syllabus_documents').delete().eq('user_id', userId).eq('subject_id', subjectId);
          await supabase.from('syllabus_documents').insert({
            id: doc.id,
            subject_id: subjectId,
            user_id: userId,
            filename: data.filename,
            file_path: data.filePath || null,
            raw_text: data.rawText,
            parsed_at: doc.parsedAt,
          });
        } catch (err) {
          console.warn('Failed to insert syllabus document into Supabase:', err);
        }
      }
    }

    return doc;
  }

  async getSyllabusDocumentBySubject(userId: string, subjectId: string): Promise<SyllabusDocument | null> {
    if (this.isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('syllabus_documents')
            .select('*')
            .eq('user_id', userId)
            .eq('subject_id', subjectId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!error && data) {
            return {
              id: data.id,
              subjectId: data.subject_id,
              userId: data.user_id,
              filename: data.filename,
              filePath: data.file_path,
              rawText: data.raw_text,
              parsedAt: data.parsed_at,
              createdAt: data.created_at,
            };
          }
        } catch {
          // fallback to local
        }
      }
    }

    const store = this.loadStore();
    return store.syllabusDocuments.find((d) => d.userId === userId && d.subjectId === subjectId) || null;
  }
}

export const repository = new Repository();
