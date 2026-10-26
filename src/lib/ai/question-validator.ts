import type { GeneratedQuestion, CitationMetadata } from '@/lib/types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates a generated question against pedagogical and grounding rules.
 */
export function validateQuestion(question: Partial<GeneratedQuestion>): ValidationResult {
  const errors: string[] = [];

  // 1. Text checks
  if (!question.questionText || question.questionText.trim().length < 15) {
    errors.push('Question text is too short or missing.');
  }

  // 2. Type checks
  if (!question.questionType || !['mcq', 'short_answer'].includes(question.questionType)) {
    errors.push('Invalid question type.');
  }

  // 3. MCQ specific checks
  if (question.questionType === 'mcq') {
    if (!question.options || question.options.length !== 4) {
      errors.push('MCQ must have exactly 4 answer options.');
    } else {
      // Check for distinct options
      const uniqueOptions = new Set(question.options.map((o) => o.trim().toLowerCase()));
      if (uniqueOptions.size !== question.options.length) {
        errors.push('MCQ has duplicate or redundant answer options.');
      }

      // Check each option for length and paragraph-like structure
      for (const opt of question.options) {
        const trimmed = opt.trim();
        if (trimmed.length === 0) {
          errors.push('MCQ option cannot be empty.');
        } else if (trimmed.length > 160) {
          errors.push(`MCQ option exceeds maximum allowed length of 160 characters (${trimmed.length} chars). Options must be concise answer choices.`);
        }

        const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
        if (wordCount > 25) {
          errors.push(`MCQ option contains too many words (${wordCount} words). Options must be concise phrases under 25 words.`);
        }

        // Check for conversational question/notes preamble leaking into options
        if (/^(what is|define\b|explain\b|why does|who is|lecture notes?:|source material:)\s+/i.test(trimmed)) {
          errors.push('MCQ option appears to contain question prompt or lecture preamble instead of a concise answer choice.');
        }

        // Check if option accidentally contains explanation phrasing or copies the entire explanation
        if (/^(explanation|as stated in|as verified in|this is because)\b/i.test(trimmed)) {
          errors.push('MCQ option contains explanatory preamble instead of a concise answer choice.');
        }
        if (question.explanation && trimmed.length > 50 && trimmed.toLowerCase().includes(question.explanation.toLowerCase())) {
          errors.push('MCQ option contains explanatory source text instead of an answer choice.');
        }
      }

      // Check that correct answer exactly matches one of the options
      if (!question.correctAnswer || !question.options.includes(question.correctAnswer)) {
        errors.push('MCQ correct answer does not match any of the provided options.');
      }
    }
  }

  // 4. Short answer checks
  if (question.questionType === 'short_answer') {
    if (!question.correctAnswer || question.correctAnswer.trim().length < 5) {
      errors.push('Short answer question requires a reference answer.');
    }
    if (!question.rubric || !question.rubric.keyConcepts || question.rubric.keyConcepts.length === 0) {
      errors.push('Short answer question requires a grading rubric with key concepts.');
    }
  }

  // 5. Grounding & Citations
  if (!question.citationMetadata || question.citationMetadata.length === 0) {
    errors.push('Question must be grounded in at least one source citation.');
  } else {
    for (const citation of question.citationMetadata) {
      if (!citation.chunkId || !citation.excerpt) {
        errors.push('Citation metadata must include valid chunkId and source excerpt.');
      }
    }
  }

  // 6. Explanation
  if (!question.explanation || question.explanation.trim().length < 10) {
    errors.push('Question requires a grounded explanation.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
