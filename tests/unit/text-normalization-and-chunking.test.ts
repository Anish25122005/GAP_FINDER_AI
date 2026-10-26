import { describe, it, expect } from 'vitest';
import { normalizeExtractedText, extractTextFromTxt } from '@/lib/ai/text-extractor';
import { chunkExtractedDocument } from '@/lib/ai/chunker';

describe('Text Normalization and Chunking Unit Tests', () => {
  it('normalizes irregular whitespace, linebreaks, and control characters', () => {
    const raw = 'Heading 1\r\n\r\n\r\n\r\nSome   text\twith\x00 null bytes and    extra spaces.\n\n\nParagraph 2.';
    const normalized = normalizeExtractedText(raw);

    expect(normalized).not.toContain('\r');
    expect(normalized).not.toContain('\x00');
    expect(normalized).toContain('Some text with null bytes and extra spaces.');
    expect(normalized).toContain('Paragraph 2.');
    // Consecutive 3+ newlines should become \n\n
    expect(normalized).not.toContain('\n\n\n');
  });

  it('rejects empty or unreadable plain text extraction', () => {
    const emptyBuffer = Buffer.from('   \n\t  ', 'utf-8');
    expect(() => extractTextFromTxt(emptyBuffer)).toThrow('empty or contains insufficient content');
  });

  it('extracts valid text and computes word count from plain text buffer', () => {
    const content = 'Distributed systems coordinate actions across multiple autonomous nodes by passing messages.';
    const buffer = Buffer.from(content, 'utf-8');
    const result = extractTextFromTxt(buffer);

    expect(result.text).toBe(content);
    expect(result.pages.length).toBe(1);
    expect(result.wordCount).toBe(11);
  });

  it('chunks documents with heading preservation and overlap', () => {
    const docText = `
Unit 1: Distributed Architectures
In a client-server architecture, clients send requests to a centralized server.
Microservices decompose complex systems into independent modular services.
Each service communicates over lightweight network protocols.

Unit 2: Consensus Protocols
Consensus ensures that distributed nodes reach agreement on shared state.
Two-Phase Commit is an atomic protocol with blocking vulnerabilities.
Raft provides leader election, log replication, and safety guarantees.
`;

    const extraction = extractTextFromTxt(Buffer.from(docText, 'utf-8'));
    const chunks = chunkExtractedDocument(extraction, {
      maxWordsPerChunk: 25,
      wordOverlap: 5,
      minWordsPerChunk: 5,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].content.length).toBeGreaterThan(10);

    // Section headings should be detected
    const detectedHeadings = chunks.map((c) => c.sectionTitle).filter(Boolean);
    expect(detectedHeadings.length).toBeGreaterThan(0);
  });

  it('preserves page numbers across chunks', () => {
    const extraction = {
      text: 'Page 1 text here. Page 2 text here.',
      pages: [
        { pageNumber: 1, text: 'This is page one content explaining consensus.' },
        { pageNumber: 2, text: 'This is page two content explaining replication.' },
      ],
      pageCount: 2,
      wordCount: 14,
      metadata: {},
    };

    const chunks = chunkExtractedDocument(extraction);
    expect(chunks.length).toBe(2);
    expect(chunks[0].pageNumber).toBe(1);
    expect(chunks[1].pageNumber).toBe(2);
  });
});
