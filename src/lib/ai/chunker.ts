import type { ExtractionResult } from './text-extractor';

export interface ChunkOptions {
  maxWordsPerChunk?: number;
  wordOverlap?: number;
  minWordsPerChunk?: number;
}

export interface GeneratedChunk {
  chunkIndex: number;
  pageNumber: number | null;
  sectionTitle: string | null;
  content: string;
  wordCount: number;
  tokenCount: number;
}

const DEFAULT_OPTIONS: Required<ChunkOptions> = {
  maxWordsPerChunk: 350,
  wordOverlap: 50,
  minWordsPerChunk: 5,
};

/**
 * Detects whether a line represents a heading or chapter/section title.
 */
function isSectionHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length > 80 || trimmed.length < 3) return false;

  // Markdown headers
  if (/^#{1,4}\s+/.test(trimmed)) return true;

  // Unit / Chapter / Section patterns
  if (/^(Unit|Chapter|Section|Module|Topic|Part)\s+\d+/i.test(trimmed)) return true;

  // Numbered outlines: "1. Introduction", "2.3 Architectures"
  if (/^\d+(\.\d+)*\s+[A-Z]/.test(trimmed)) return true;

  // ALL CAPS short lines: "INTRODUCTION TO DISTRIBUTED SYSTEMS"
  if (trimmed === trimmed.toUpperCase() && /^[A-Z\s]{4,50}$/.test(trimmed)) return true;

  return false;
}

/**
 * Splits extracted document pages into semantically cohesive overlapping chunks.
 * Preserves page numbers and section headers.
 */
export function chunkExtractedDocument(
  extraction: ExtractionResult,
  options: ChunkOptions = {}
): GeneratedChunk[] {
  const opts: Required<ChunkOptions> = { ...DEFAULT_OPTIONS, ...options };
  const chunks: GeneratedChunk[] = [];
  let chunkIndex = 0;
  let currentSectionTitle: string | null = null;

  for (const page of extraction.pages) {
    const lines = page.text.split('\n');
    let currentWords: string[] = [];
    let currentLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Update current heading if detected
      if (isSectionHeading(line)) {
        currentSectionTitle = line.replace(/^#{1,4}\s+/, '').trim();
      }

      const lineWords = line.split(/\s+/).filter(Boolean);
      currentWords.push(...lineWords);
      currentLines.push(line);

      // Check if chunk has reached maximum word size
      if (currentWords.length >= opts.maxWordsPerChunk) {
        const content = currentLines.join('\n').trim();
        if (currentWords.length >= opts.minWordsPerChunk) {
          chunks.push({
            chunkIndex,
            pageNumber: page.pageNumber,
            sectionTitle: currentSectionTitle,
            content,
            wordCount: currentWords.length,
            tokenCount: Math.ceil(currentWords.length * 1.3), // standard token estimation
          });
          chunkIndex++;
        }

        // Prepare overlap for next chunk
        const overlapWords = currentWords.slice(-opts.wordOverlap);
        const overlapText = overlapWords.join(' ');
        currentWords = [...overlapWords];
        currentLines = [overlapText];
      }
    }

    // Flush any remaining words on this page
    if (currentWords.length >= opts.minWordsPerChunk) {
      const content = currentLines.join('\n').trim();
      chunks.push({
        chunkIndex,
        pageNumber: page.pageNumber,
        sectionTitle: currentSectionTitle,
        content,
        wordCount: currentWords.length,
        tokenCount: Math.ceil(currentWords.length * 1.3),
      });
      chunkIndex++;
    }
  }

  // If extraction had no pages or very short text, create a single chunk
  if (chunks.length === 0 && extraction.text.trim().length > 0) {
    const words = extraction.text.split(/\s+/).filter(Boolean);
    chunks.push({
      chunkIndex: 0,
      pageNumber: 1,
      sectionTitle: 'General Content',
      content: extraction.text.trim(),
      wordCount: words.length,
      tokenCount: Math.ceil(words.length * 1.3),
    });
  }

  return chunks;
}
