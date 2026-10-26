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
