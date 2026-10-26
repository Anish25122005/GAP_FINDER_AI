// ==============================================================================
// GapFinder AI - Core TypeScript Types & Domain Interfaces
// Strict type safety across frontend, backend, AI orchestration, and database
// ==============================================================================

export type MasteryStatus = 'weak' | 'medium' | 'strong' | 'insufficient_evidence';
export type QuestionType = 'mcq' | 'short_answer';
export type QuestionDifficulty = 'easy' | 'medium' | 'hard';
export type AttemptStatus = 'in_progress' | 'completed' | 'abandoned';
export type CorrectnessClassification = 'correct' | 'partially_correct' | 'incorrect';
export type PlanItemPriority = 'high' | 'medium' | 'low';
export type PlanItemStatus = 'pending' | 'completed' | 'skipped';
export type DocumentStatus = 'uploaded' | 'processing' | 'indexed' | 'failed';

export interface UserProfile {
  id: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Subject {
  id: string;
  userId: string;
  name: string;
  code?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyllabusDocument {
  id: string;
  subjectId: string;
  userId: string;
  filename: string;
  filePath?: string;
  rawText: string;
  parsedAt?: string;
  createdAt: string;
}

export interface Topic {
  id: string;
  subjectId: string;
  userId: string;
  parentId?: string | null;
  name: string;
  code?: string;
  level: number; // 1: Unit, 2: Topic, 3: Subtopic
  description?: string;
  weight: number; // e.g. 1.0, 1.5, etc.
  orderIndex: number;
  createdAt: string;
  children?: Topic[];
}

export interface DocumentRecord {
  id: string;
  userId: string;
  subjectId?: string | null;
  title: string;
  filename: string;
  fileType: 'pdf' | 'txt';
  fileSize: number;
  storagePath?: string;
  status: DocumentStatus;
  errorMessage?: string;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  userId: string;
  subjectId?: string | null;
  chunkIndex: number;
  pageNumber?: number | null;
  sectionTitle?: string | null;
  content: string;
  tokenCount?: number;
  embedding?: number[];
  createdAt: string;
}

export interface TopicChunkMapping {
  id: string;
  topicId: string;
  chunkId: string;
  relevanceScore: number;
  method: 'semantic' | 'keyword' | 'manual';
  createdAt: string;
}

export interface CitationMetadata {
  documentId: string;
  documentTitle: string;
  chunkId: string;
  pageNumber?: number | null;
  sectionTitle?: string | null;
  excerpt: string;
}

export interface ShortAnswerRubric {
  keyConcepts: string[];
  partialCreditCriteria?: string[];
  commonMisconceptions?: string[];
  referenceAnswer: string;
}

export interface GeneratedQuestion {
  id: string;
  userId: string;
  subjectId: string;
  topicId: string;
  questionText: string;
  questionType: QuestionType;
  difficulty: QuestionDifficulty;
  options?: string[]; // for MCQ: 4 options
  correctAnswer: string; // for MCQ: exact matching option text, for short: reference answer
  rubric?: ShortAnswerRubric;
  explanation: string;
  citationMetadata: CitationMetadata[];
  isFlagged?: boolean;
  createdAt: string;
}

export interface Quiz {
  id: string;
  userId: string;
  subjectId: string;
  title: string;
  questionCount: number;
  status: 'ready' | 'generating' | 'completed';
  topicIds: string[];
  createdAt: string;
  questions?: GeneratedQuestion[];
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  userId: string;
  subjectId: string;
  status: AttemptStatus;
  totalScore: number;
  maxScore: number;
  percentage: number;
  startedAt: string;
  completedAt?: string | null;
  answers?: StudentAnswerWithEvaluation[];
}

export interface StudentAnswer {
  id: string;
  attemptId: string;
  questionId: string;
  userId: string;
  selectedOption?: string | null;
  shortAnswerText?: string | null;
  createdAt: string;
}

export interface AnswerEvaluation {
  id: string;
  studentAnswerId: string;
  correctness: CorrectnessClassification;
  score: number; // 0.0 to 1.0
  keyConceptsIdentified: string[];
  missingConcepts: string[];
  incorrectClaims: string[];
  explanation: string;
  confidence: number; // 0.0 to 1.0
  createdAt: string;
}

export interface StudentAnswerWithEvaluation extends StudentAnswer {
  question?: GeneratedQuestion;
  evaluation?: AnswerEvaluation;
}

export interface TopicMasterySnapshot {
  id: string;
  userId: string;
  subjectId: string;
  topicId: string;
  topicName?: string;
  masteryScore: number; // 0.0 to 100.0%
  status: MasteryStatus;
  questionsAttempted: number;
  correctCount: number;
  incorrectCount: number;
  confidence: number; // 0.0 to 1.0 (based on evidence sufficiency)
  keyGaps: string[];
  lastAssessmentAt: string;
  calculatedAt: string;
}

export interface RevisionPlan {
  id: string;
  userId: string;
  subjectId: string;
  targetExamDate: string; // YYYY-MM-DD
  dailyStudyMinutes: number;
  availableDays: string[]; // ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  sessionDurationMinutes: number;
  status: 'active' | 'archived' | 'completed';
  createdAt: string;
  updatedAt: string;
  items?: RevisionPlanItem[];
}

export interface RevisionPlanItem {
  id: string;
  revisionPlanId: string;
  topicId: string;
  topicName?: string;
  priority: PlanItemPriority;
  recommendedActivity: string;
  estimatedMinutes: number;
  targetDate: string; // YYYY-MM-DD
  reason: string;
  status: PlanItemStatus;
  completedAt?: string | null;
  orderIndex: number;
}

export interface ChatSession {
  id: string;
  userId: string;
  subjectId: string;
  topicId?: string | null;
  title: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  citations: CitationMetadata[];
  isGrounded: boolean;
  createdAt: string;
}

export interface ProcessingJob {
  id: string;
  userId: string;
  documentId: string;
  jobType: 'extract' | 'chunk' | 'embed' | 'map_topics';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

// UI State types
export interface GapReportSummary {
  subjectId: string;
  subjectName: string;
  totalTopics: number;
  assessedTopics: number;
  weakCount: number;
  mediumCount: number;
  strongCount: number;
  insufficientEvidenceCount: number;
  overallMastery: number;
  topicSnapshots: TopicMasterySnapshot[];
}
