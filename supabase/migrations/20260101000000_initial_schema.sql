-- ==============================================================================
-- GapFinder AI - PostgreSQL + pgvector Database Schema & Migrations
-- Complete Normalized Relational Schema with Row Level Security (RLS)
-- ==============================================================================

-- 1. Enable pgvector extension for semantic RAG search
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. User Profiles Table (Mirrors Supabase Auth Users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Subjects Table
CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subjects_user_id ON subjects(user_id);

-- 4. Syllabus Documents
CREATE TABLE IF NOT EXISTS syllabus_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_path TEXT,
  raw_text TEXT NOT NULL,
  parsed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_syllabus_subject_id ON syllabus_documents(subject_id);

-- 5. Syllabus Topics Hierarchy
CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  level INT NOT NULL DEFAULT 1, -- 1: Unit, 2: Topic, 3: Subtopic
  description TEXT,
  weight NUMERIC(4, 2) DEFAULT 1.0,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topics_subject_id ON topics(subject_id);
CREATE INDEX IF NOT EXISTS idx_topics_parent_id ON topics(parent_id);

-- 6. Learning Material Documents
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'pdf' or 'txt'
  file_size INT NOT NULL,
  storage_path TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded', -- 'uploaded', 'processing', 'indexed', 'failed'
  error_message TEXT,
  chunk_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_subject_id ON documents(subject_id);

-- 7. Document Chunks & Vector Embeddings
-- Using 1536-dimensional vectors compatible with OpenAI text-embedding-3-small
CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  chunk_index INT NOT NULL,
  page_number INT,
  section_title TEXT,
  content TEXT NOT NULL,
  token_count INT,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_user_id ON document_chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_chunks_subject_id ON document_chunks(subject_id);

-- 8. Topic-to-Chunk Mapping
CREATE TABLE IF NOT EXISTS topic_chunk_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
  relevance_score NUMERIC(5, 4) NOT NULL,
  method TEXT NOT NULL DEFAULT 'semantic', -- 'semantic', 'keyword', 'manual'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_topic_chunk UNIQUE(topic_id, chunk_id)
);

CREATE INDEX IF NOT EXISTS idx_tcm_topic_id ON topic_chunk_mappings(topic_id);
CREATE INDEX IF NOT EXISTS idx_tcm_chunk_id ON topic_chunk_mappings(chunk_id);

-- 9. Generated Diagnostic Questions
CREATE TABLE IF NOT EXISTS generated_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL, -- 'mcq' or 'short_answer'
  difficulty TEXT NOT NULL DEFAULT 'medium', -- 'easy', 'medium', 'hard'
  options JSONB, -- Array of strings for MCQ: ["A", "B", "C", "D"]
  correct_answer TEXT NOT NULL, -- Correct option or reference answer
  rubric JSONB, -- Criteria & key concepts for short answers
  explanation TEXT NOT NULL,
  citation_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gen_q_topic_id ON generated_questions(topic_id);
CREATE INDEX IF NOT EXISTS idx_gen_q_subject_id ON generated_questions(subject_id);

-- 10. Question Source Mappings (Grounding Verification)
CREATE TABLE IF NOT EXISTS question_source_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID NOT NULL REFERENCES generated_questions(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
  quote TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Quizzes
CREATE TABLE IF NOT EXISTS quizzes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  question_count INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready', -- 'generating', 'ready', 'completed'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_user_id ON quizzes(user_id);

-- 12. Quiz Questions Link
CREATE TABLE IF NOT EXISTS quiz_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES generated_questions(id) ON DELETE CASCADE,
  order_index INT NOT NULL,
  CONSTRAINT uq_quiz_question UNIQUE(quiz_id, question_id)
);

-- 13. Quiz Attempts
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'abandoned'
  total_score NUMERIC(5, 2) DEFAULT 0,
  max_score NUMERIC(5, 2) DEFAULT 0,
  percentage NUMERIC(5, 2) DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_attempts_user_id ON quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_quiz_id ON quiz_attempts(quiz_id);

-- 14. Student Answers
CREATE TABLE IF NOT EXISTS student_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES generated_questions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  selected_option TEXT,
  short_answer_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_attempt_question UNIQUE(attempt_id, question_id)
);

-- 15. Answer Evaluations
CREATE TABLE IF NOT EXISTS answer_evaluations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_answer_id UUID NOT NULL REFERENCES student_answers(id) ON DELETE CASCADE,
  correctness TEXT NOT NULL, -- 'correct', 'partially_correct', 'incorrect'
  score NUMERIC(4, 2) NOT NULL, -- 0.00 to 1.00
  key_concepts_identified JSONB DEFAULT '[]'::jsonb,
  missing_concepts JSONB DEFAULT '[]'::jsonb,
  incorrect_claims JSONB DEFAULT '[]'::jsonb,
  explanation TEXT NOT NULL,
  confidence NUMERIC(3, 2) NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. Topic Mastery Snapshots (Deterministic Gap Engine Results)
CREATE TABLE IF NOT EXISTS topic_mastery_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  mastery_score NUMERIC(5, 2) NOT NULL, -- 0.0 to 100.0%
  status TEXT NOT NULL, -- 'weak', 'medium', 'strong', 'insufficient_evidence'
  questions_attempted INT NOT NULL DEFAULT 0,
  correct_count INT NOT NULL DEFAULT 0,
  incorrect_count INT NOT NULL DEFAULT 0,
  confidence NUMERIC(3, 2) NOT NULL DEFAULT 0.0,
  key_gaps JSONB DEFAULT '[]'::jsonb,
  last_assessment_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_topic_mastery UNIQUE(user_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_mastery_user_subject ON topic_mastery_snapshots(user_id, subject_id);

-- 17. Revision Plans
CREATE TABLE IF NOT EXISTS revision_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  target_exam_date DATE NOT NULL,
  daily_study_minutes INT NOT NULL,
  available_days JSONB NOT NULL, -- ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  session_duration_minutes INT DEFAULT 45,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'archived', 'completed'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rev_plans_user_id ON revision_plans(user_id);

-- 18. Revision Plan Items
CREATE TABLE IF NOT EXISTS revision_plan_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  revision_plan_id UUID NOT NULL REFERENCES revision_plans(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  priority TEXT NOT NULL, -- 'high', 'medium', 'low'
  recommended_activity TEXT NOT NULL,
  estimated_minutes INT NOT NULL,
  target_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'skipped'
  completed_at TIMESTAMPTZ,
  order_index INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_rpi_plan_id ON revision_plan_items(revision_plan_id);

-- 19. Topic Assistant Chat Sessions & Messages
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- 'user', 'assistant'
  content TEXT NOT NULL,
  citations JSONB DEFAULT '[]'::jsonb,
  is_grounded BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 20. Async Document Processing Jobs
CREATE TABLE IF NOT EXISTS processing_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL, -- 'extract', 'chunk', 'embed', 'map_topics'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  progress INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 21. Vector Similarity Match Function (Postgres RPC)
-- ==============================================================================
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter_user_id uuid,
  filter_subject_id uuid DEFAULT NULL,
  filter_document_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  user_id uuid,
  subject_id uuid,
  chunk_index int,
  page_number int,
  section_title text,
  content text,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.user_id,
    dc.subject_id,
    dc.chunk_index,
    dc.page_number,
    dc.section_title,
    dc.content,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  WHERE dc.user_id = filter_user_id
    AND (filter_subject_id IS NULL OR dc.subject_id = filter_subject_id)
    AND (filter_document_id IS NULL OR dc.document_id = filter_document_id)
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ==============================================================================
-- 22. Row Level Security (RLS) Policies
-- Enforce user data isolation at database engine level
-- ==============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE syllabus_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_chunk_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE answer_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_mastery_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE revision_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE revision_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can view and update their own profile
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Subjects
CREATE POLICY "Users manage own subjects" ON subjects FOR ALL USING (auth.uid() = user_id);

-- Syllabus Documents
CREATE POLICY "Users manage own syllabus docs" ON syllabus_documents FOR ALL USING (auth.uid() = user_id);

-- Topics
CREATE POLICY "Users manage own topics" ON topics FOR ALL USING (auth.uid() = user_id);

-- Documents
CREATE POLICY "Users manage own documents" ON documents FOR ALL USING (auth.uid() = user_id);

-- Document Chunks
CREATE POLICY "Users manage own document chunks" ON document_chunks FOR ALL USING (auth.uid() = user_id);

-- Questions
CREATE POLICY "Users manage own questions" ON generated_questions FOR ALL USING (auth.uid() = user_id);

-- Quizzes & Attempts
CREATE POLICY "Users manage own quizzes" ON quizzes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own attempts" ON quiz_attempts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own answers" ON student_answers FOR ALL USING (auth.uid() = user_id);

-- Topic Mastery
CREATE POLICY "Users manage own mastery snapshots" ON topic_mastery_snapshots FOR ALL USING (auth.uid() = user_id);

-- Revision Plans
CREATE POLICY "Users manage own revision plans" ON revision_plans FOR ALL USING (auth.uid() = user_id);

-- Chat
CREATE POLICY "Users manage own chat sessions" ON chat_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own chat messages" ON chat_messages FOR ALL USING (auth.uid() = user_id);

-- Jobs
CREATE POLICY "Users manage own jobs" ON processing_jobs FOR ALL USING (auth.uid() = user_id);
