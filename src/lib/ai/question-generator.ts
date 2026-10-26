import { z } from 'zod';
import { aiProvider, sanitizeUntrustedContent } from './provider';
import { validateQuestion } from './question-validator';
import type { GeneratedQuestion, DocumentChunk, Topic, CitationMetadata } from '@/lib/types';
import { repository } from '@/lib/db/repository';

const GeneratedQuestionSchema = z.object({
  questionText: z.string().min(15),
  questionType: z.enum(['mcq', 'short_answer']),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  options: z.array(z.string().max(160, 'Options must be concise under 160 characters')).length(4).optional(),
  correctAnswer: z.string().min(1),
  explanation: z.string().min(10),
  keyConcepts: z.array(z.string()).optional(),
  citedExcerpt: z.string().min(10),
});

const QuestionBatchSchema = z.object({
  questions: z.array(GeneratedQuestionSchema),
});

export interface QuestionGenerationOptions {
  userId: string;
  subjectId: string;
  topic: Topic;
  chunks: DocumentChunk[];
  count?: number;
  preferType?: 'mcq' | 'short_answer' | 'mixed';
}

/**
 * Shuffles options randomly (Fisher-Yates) and ensures correctAnswer matches
 * the exact string of the chosen correct option in the new shuffled array.
 */
export function shuffleOptionsAndAlignAnswer(
  options: string[],
  correctAnswer: string
): { shuffledOptions: string[]; alignedCorrectAnswer: string } {
  const cleaned = options.map((opt) => opt.trim().replace(/^[A-Da-d][).:-]\s*/, ''));
  const targetAnswer = correctAnswer.trim().replace(/^[A-Da-d][).:-]\s*/, '');

  let chosenAnswer = targetAnswer;
  const matchIndex = cleaned.findIndex((o) => o.toLowerCase() === targetAnswer.toLowerCase());
  if (matchIndex >= 0) {
    chosenAnswer = cleaned[matchIndex];
  } else {
    chosenAnswer = cleaned[0];
  }

  const shuffled = [...cleaned];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return {
    shuffledOptions: shuffled,
    alignedCorrectAnswer: chosenAnswer,
  };
}

/**
 * Generates grounded diagnostic questions for a topic using retrieved chunks.
 */
export async function generateQuestionsForTopic(
  options: QuestionGenerationOptions
): Promise<GeneratedQuestion[]> {
  const { userId, subjectId, topic, chunks, count = 3, preferType = 'mixed' } = options;

  if (chunks.length === 0) {
    throw new Error(
      `Cannot generate diagnostic questions for topic "${topic.name}" because no learning material has been uploaded or mapped to this topic.`
    );
  }

  // Fetch subject-wide chunks to provide a rich academic distractor pool
  let allAvailableChunks = chunks;
  try {
    const subjectChunks = await repository.getChunksBySubjectId(userId, subjectId);
    const existingIds = new Set(chunks.map((c) => c.id));
    const additional = subjectChunks.filter((sc) => !existingIds.has(sc.id));
    allAvailableChunks = [...chunks, ...additional];
  } catch {
    // fallback to provided chunks
  }

  // Combine top chunks for prompt context
  const contextText = chunks
    .slice(0, 4)
    .map((c, idx) => `[Source Chunk ${idx + 1} | Page ${c.pageNumber || 'N/A'} | Section: ${c.sectionTitle || 'General'}]\n${c.content}`)
    .join('\n\n---\n\n');

  const sanitizedContext = sanitizeUntrustedContent(contextText);

  const prompt = `
You are an expert academic diagnostic exam author. Generate ${count} rigorous diagnostic assessment questions for the syllabus topic: "${topic.name}".

Context Material:
<<<UNTRUSTED_RETRIEVED_CONTEXT>>>
${sanitizedContext}
<<<UNTRUSTED_RETRIEVED_CONTEXT>>>

Requirements:
1. Every question MUST be strictly grounded in the facts presented in the retrieved context material above.
2. Generate question types: ${preferType === 'mixed' ? 'A mix of multiple-choice (MCQ) and short-answer' : preferType}.
3. Question stems MUST vary naturally. NEVER repeat generic template stems like "According to the course notes on X, what is the primary function or principle described?". Use varied inquiry angles:
   - Mechanism / Operation (e.g. "How does [Mechanism] enforce [Property]?")
   - Prerequisites / Conditions (e.g. "Under what circumstances does [Phenomenon] occur?")
   - Distinction / Trade-offs (e.g. "What trade-off distinguishes [Approach A] from [Approach B]?")
   - Purpose / Objective (e.g. "What primary issue is resolved by [Concept]?")
4. For multiple-choice questions:
   - Provide exactly 4 distinct, plausible options.
   - Each option MUST be a concise phrase or short sentence under 15 words (maximum 120 characters).
   - NEVER put entire paragraphs, textbook notes, student names, rhetorical questions, or explanatory text into an answer option.
   - Exactly one option must be strictly correct according to the context.
   - Three options must be plausible distractors representing genuine academic misconceptions, adjacent mechanisms from the subject area, or incorrect applications.
   - NEVER create distractors by mechanically inserting the topic name into boilerplate sentences (e.g. DO NOT use "an external monitoring layer", "a static configuration unrelated to...", "a sequential validation without parallel...").
   - Do NOT always make the first option (Option A) the correct answer. Vary the correct option position.
5. For short-answer questions:
   - Provide a concise reference answer.
   - List 2 to 4 key concepts required for grading.
6. In "citedExcerpt", quote the exact 1-2 sentence evidence from the context that proves the answer.
7. Provide a clear educational explanation of why the answer is correct and why common misconceptions fail.
8. Return a JSON object with a "questions" array.
`;

  const fallbackGenerator = (): z.infer<typeof QuestionBatchSchema> => {
    // Collect all factual sentences from topic chunks first, then subject chunks
    const allSentences: string[] = [];
    for (const chunk of allAvailableChunks.slice(0, 8)) {
      const cleanContent = chunk.content
        .replace(/[\r\n]+/g, ' ')
        .replace(/^(?:what\s+is|define|explain|overview\s+of|notes?\s+on)\s+[^?.:\n]+[?.:\n]+/i, '')
        .replace(/^[A-Z][A-Za-z0-9\s_-]+:\s*/, '')
        .trim();
      const sentences = cleanContent
        .split(/(?<=[.?!])\s+/)
        .map((s) => s.trim().replace(/^[-*•\d.)\s]+/, ''))
        .filter((s) => s.length > 15 && s.length < 140 && !/^(what is|who is|why does|example:)\b/i.test(s))
        .filter((s) => !/^(?:[A-Z][a-z]+\s+(?:studies|researches|explores|reads|learns|attended|works|is a student)|(?:i|we|he|she|they|my|our)\b)/i.test(s))
        .filter((s) => !/(?:studies at|is a student|enrolled in)\b/i.test(s));
      allSentences.push(...sentences);
    }

    // Deduplicate and constrain length for concise options (< 120 chars, < 18 words)
    const uniqueSentences = [...new Set(allSentences.map((s) => s.trim()))]
      .map((s) => {
        if (s.length > 120 || s.split(/\s+/).length > 18) {
          const clauseMatch = s.match(/^([^,;:]+[,;:]?[^,;:]*)/);
          if (clauseMatch && clauseMatch[1].length >= 20 && clauseMatch[1].length <= 120) {
            return clauseMatch[1].trim().replace(/[.,;:]$/, '');
          }
          return s.split(/\s+/).slice(0, 14).join(' ');
        }
        return s.replace(/[.,;:]$/, '');
      })
      .filter((s) => s.length >= 15);

    const questions: z.infer<typeof GeneratedQuestionSchema>[] = [];
    const usedStems = new Set<string>();

    // Helper to generate a question for a given sentence and index
    const buildQuestionForIndex = (qIdx: number): z.infer<typeof GeneratedQuestionSchema> | null => {
      const sentence = uniqueSentences[qIdx % Math.max(1, uniqueSentences.length)] || `Core foundational mechanism of ${topic.name}`;
      const cleanCorrectAnswer = sentence.trim().replace(/[.,;:]$/, '');
      const chunkForCitation = chunks[qIdx % chunks.length] || chunks[0];
      const excerpt = chunkForCitation.content.slice(0, 180).trim();

      // Extract subject/concept from sentence if possible
      const conceptMatch = sentence.match(/^((?:The\s+|An?\s+)?(?:[A-Z][A-Za-z0-9_-]*(?:\s+[A-Za-z0-9_-]+){0,2}))\s+(?:is|are|solves?|provides?|occurs?|assumes?|ensures?|guarantees?|uses?|translates?|requires?|asserts?|implements?)\b/i);
      const conceptName = conceptMatch ? conceptMatch[1].trim() : topic.name;

      // Natural, non-formulaic question stems varied by inquiry angle
      const stemTemplates = [
        `Which operational mechanism or principle is attributed to ${conceptName} in the course material?`,
        `What primary function or guarantee does ${conceptName} provide within ${topic.name}?`,
        `How does ${conceptName} operate according to the authoritative notes?`,
        `Under what condition or technical requirement does ${conceptName} apply?`,
      ];
      let stem = stemTemplates[qIdx % stemTemplates.length];
      if (usedStems.has(stem)) {
        stem = `In the context of ${topic.name}, which statement accurately describes the role of ${conceptName}?`;
      }
      usedStems.add(stem);

      // Collect real academic distractors from other sentences in the material
      const pool = uniqueSentences.filter(
        (s) => s.toLowerCase() !== cleanCorrectAnswer.toLowerCase() && s.length >= 15 && s.length <= 120
      );

      const distractors: string[] = [];
      const usedLower = new Set([cleanCorrectAnswer.toLowerCase()]);

      for (const cand of pool) {
        if (distractors.length >= 3) break;
        const low = cand.toLowerCase();
        if (!usedLower.has(low)) {
          usedLower.add(low);
          distractors.push(cand);
        }
      }

      // Domain-specific plausible alternative mechanisms if material has few sentences
      const domainContrastingMechanisms = [
        'Coordinates execution using centralized polling rather than distributed consensus',
        'Operates asynchronously without state verification or consistency guarantees',
        'Applies static pre-allocation bypassing runtime dynamic requirements',
        'Relies on unverified client-side caching without authoritative validation',
        'Executes sequential scans lacking indexed lookup or hashing structures',
        'Permits concurrent unsynchronized execution across shared memory addresses',
      ];

      for (const alt of domainContrastingMechanisms) {
        if (distractors.length >= 3) break;
        const low = alt.toLowerCase();
        if (!usedLower.has(low)) {
          usedLower.add(low);
          distractors.push(alt);
        }
      }

      if (distractors.length < 3) {
        return null; // Cannot support 4 valid options without fabrication
      }

      const rawOptions = [cleanCorrectAnswer, ...distractors.slice(0, 3)];
      const { shuffledOptions, alignedCorrectAnswer } = shuffleOptionsAndAlignAnswer(rawOptions, cleanCorrectAnswer);

      return {
        questionText: stem,
        questionType: 'mcq',
        difficulty: qIdx % 3 === 0 ? 'medium' : qIdx % 3 === 1 ? 'hard' : 'easy',
        options: shuffledOptions,
        correctAnswer: alignedCorrectAnswer,
        explanation: `As verified in the course materials: "${excerpt}...", this represents the grounded academic mechanism.`,
        citedExcerpt: excerpt,
      };
    };

    // 1. First question: MCQ
    const firstMcq = buildQuestionForIndex(0);
    if (firstMcq) {
      questions.push(firstMcq);
    }

    // 2. Short answer if count > 1
    if (count > 1) {
      const secondCandidate = uniqueSentences[1] || uniqueSentences[0] || `Key concepts include structured analysis and evidence evaluation.`;
      const secondExcerpt = secondCandidate.slice(0, 120).trim();
      questions.push({
        questionText: `Explain the technical mechanism of ${topic.name} and describe its key operational considerations based on your course notes.`,
        questionType: 'short_answer',
        difficulty: 'medium',
        correctAnswer: secondExcerpt,
        explanation: `Course text states: "${secondExcerpt}". A complete response must address this core mechanism.`,
        keyConcepts: [topic.name, 'Operational considerations', 'Core mechanism'],
        citedExcerpt: secondExcerpt,
      });
    }

    // 3. Additional questions if count >= 3
    for (let i = 2; i < count; i++) {
      if (preferType === 'short_answer' || (preferType === 'mixed' && i % 2 === 1)) {
        const sentence = uniqueSentences[i % Math.max(1, uniqueSentences.length)] || `Operational guarantee of ${topic.name}`;
        const excerpt = sentence.slice(0, 120).trim();
        questions.push({
          questionText: `Describe how ${topic.name} addresses system trade-offs or constraints discussed in the notes.`,
          questionType: 'short_answer',
          difficulty: 'hard',
          correctAnswer: excerpt,
          explanation: `Course materials indicate: "${excerpt}..."`,
          keyConcepts: [topic.name, 'Trade-offs', 'Constraints'],
          citedExcerpt: excerpt,
        });
      } else {
        const mcq = buildQuestionForIndex(i);
        if (mcq) questions.push(mcq);
      }
    }

    return { questions };
  };

  let rawQuestions: z.infer<typeof GeneratedQuestionSchema>[] = [];

  try {
    const result = await aiProvider.generateStructuredOutput(
      [{ role: 'user', content: prompt }],
      QuestionBatchSchema,
      fallbackGenerator
    );
    rawQuestions = result.questions;
  } catch {
    rawQuestions = fallbackGenerator().questions;
  }

  // Validate, sanitize, shuffle, and construct domain objects with source citation links
  const validatedQuestions: GeneratedQuestion[] = [];

  for (const q of rawQuestions) {
    // Associate with the most relevant chunk
    const matchingChunk =
      chunks.find((c) => c.content.includes(q.citedExcerpt.slice(0, 30))) || chunks[0];

    const citation: CitationMetadata = {
      documentId: matchingChunk.documentId,
      documentTitle: matchingChunk.sectionTitle || 'Document Material',
      chunkId: matchingChunk.id,
      pageNumber: matchingChunk.pageNumber,
      sectionTitle: matchingChunk.sectionTitle,
      excerpt: q.citedExcerpt,
    };

    let processedOptions = q.options;
    let processedAnswer = q.correctAnswer;

    // For MCQ, strip letter prefixes, enforce concise limits, and shuffle options
    if (q.questionType === 'mcq' && q.options && q.options.length === 4) {
      const { shuffledOptions, alignedCorrectAnswer } = shuffleOptionsAndAlignAnswer(
        q.options,
        q.correctAnswer
      );
      processedOptions = shuffledOptions;
      processedAnswer = alignedCorrectAnswer;
    }

    const candidate: Omit<GeneratedQuestion, 'id' | 'createdAt'> = {
      userId,
      subjectId,
      topicId: topic.id,
      questionText: q.questionText,
      questionType: q.questionType,
      difficulty: q.difficulty,
      options: processedOptions,
      correctAnswer: processedAnswer,
      rubric:
        q.questionType === 'short_answer'
          ? {
              keyConcepts: q.keyConcepts || [topic.name],
              referenceAnswer: processedAnswer,
            }
          : undefined,
      explanation: q.explanation,
      citationMetadata: [citation],
      isFlagged: false,
    };

    const validation = validateQuestion(candidate);
    if (validation.isValid) {
      validatedQuestions.push({
        ...candidate,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      });
    } else {
      console.warn('Discarded invalid generated question:', validation.errors);
    }
  }

  if (validatedQuestions.length === 0) {
    // Run fallback generator as fail-safe guarantee
    const fb = fallbackGenerator();
    for (const q of fb.questions) {
      const matchingChunk = chunks[0];
      const citation: CitationMetadata = {
        documentId: matchingChunk.documentId,
        documentTitle: matchingChunk.sectionTitle || 'Document Material',
        chunkId: matchingChunk.id,
        pageNumber: matchingChunk.pageNumber,
        sectionTitle: matchingChunk.sectionTitle,
        excerpt: q.citedExcerpt,
      };
      validatedQuestions.push({
        id: crypto.randomUUID(),
        userId,
        subjectId,
        topicId: topic.id,
        questionText: q.questionText,
        questionType: q.questionType,
        difficulty: q.difficulty,
        options: q.options,
        correctAnswer: q.correctAnswer,
        rubric:
          q.questionType === 'short_answer'
            ? {
                keyConcepts: q.keyConcepts || [topic.name],
                referenceAnswer: q.correctAnswer,
              }
            : undefined,
        explanation: q.explanation,
        citationMetadata: [citation],
        isFlagged: false,
        createdAt: new Date().toISOString(),
      });
    }
  }

  // Persist generated questions into the question repository
  await repository.saveQuestions(validatedQuestions);
  return validatedQuestions;
}
