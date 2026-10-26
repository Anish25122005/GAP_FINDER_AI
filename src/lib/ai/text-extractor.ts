// IMPORTANT: polyfills MUST be imported before pdf-parse and pdf.worker.mjs so that
// DOMMatrix, Path2D, and ImageData globals exist when pdfjs-dist
// evaluates its module-scope code (e.g. `const SCALE_MATRIX = new DOMMatrix()`).
import './pdf-polyfills';
// Pre-register pdf.worker into globalThis.pdfjsWorker so pdfjs-dist uses the in-memory
// WorkerMessageHandler directly and does NOT trigger runtime `import(this.workerSrc)`
// on Vercel where relative file resolution fails.
import 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { PDFParse } from 'pdf-parse';

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export interface ExtractionResult {
  text: string;
  pages: ExtractedPage[];
  pageCount: number;
  wordCount: number;
  metadata: {
    title?: string;
    author?: string;
    creationDate?: string;
  };
}

/**
 * Normalizes text extracted from PDF or TXT documents.
 * Cleans up erratic whitespace, page headers/footers, and non-printable characters
 * while preserving paragraph breaks and headers.
 */
export function normalizeExtractedText(text: string): string {
  if (!text) return '';

  return (
    text
      // Normalize Unicode line breaks
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove null bytes and non-printable control characters (except tabs and newlines)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Replace multiple consecutive tabs/spaces with a single space
      .replace(/[ \t]+/g, ' ')
      // Replace 3 or more consecutive newlines with two newlines
      .replace(/\n{3,}/g, '\n\n')
      // Trim lines
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .trim()
  );
}

/**
 * Extracts readable text from a PDF Buffer.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<ExtractionResult> {
  const parser = new PDFParse({ data: buffer });
  try {
    const textResult = await parser.getText();
    const rawText = textResult.text || '';
    const normalized = normalizeExtractedText(rawText);

    if (normalized.trim().length < 20) {
      throw new Error(
        'The uploaded PDF contains little to no extractable text. It may be a scanned image or protected document. Please upload a searchable text PDF or TXT file.'
      );
    }

    const pages: ExtractedPage[] = (textResult.pages || [])
      .map((p: any, idx: number) => ({
        pageNumber: p.num || idx + 1,
        text: normalizeExtractedText(p.text || ''),
      }))
      .filter((p: ExtractedPage) => p.text.length > 0);

    const words = normalized.split(/\s+/).filter(Boolean);

    return {
      text: normalized,
      pages: pages.length > 0 ? pages : [{ pageNumber: 1, text: normalized }],
      pageCount: textResult.total || (pages.length > 0 ? pages.length : 1),
      wordCount: words.length,
      metadata: {},
    };
  } catch (error: any) {
    if (error.name === 'PasswordException' || /password|encrypt/i.test(error.message || '')) {
      throw new Error('This PDF is encrypted or password-protected. Please upload an unencrypted document.');
    }
    if (error.name === 'InvalidPDFException' || /invalid pdf|corrupt/i.test(error.message || '')) {
      throw new Error('This PDF file is corrupted or has an invalid structure.');
    }
    if (error.message?.includes('little to no extractable text')) {
      throw error;
    }
    throw new Error(`Failed to extract text from PDF: ${error.message || 'Corrupted or unreadable PDF'}`);
  } finally {
    try {
      await parser.destroy();
    } catch {
      // ignore
    }
  }
}

/**
 * Extracts and normalizes text from a plain text buffer.
 */
export function extractTextFromTxt(buffer: Buffer): ExtractionResult {
  const rawText = buffer.toString('utf-8');
  const normalized = normalizeExtractedText(rawText);

  if (normalized.trim().length < 10) {
    throw new Error('The uploaded text file is empty or contains insufficient content.');
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  // Plain text treated as 1 page
  const pages: ExtractedPage[] = [
    {
      pageNumber: 1,
      text: normalized,
    },
  ];

  return {
    text: normalized,
    pages,
    pageCount: 1,
    wordCount: words.length,
    metadata: {},
  };
}
