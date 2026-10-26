import { describe, it, expect } from 'vitest';
import { extractTextFromPdf, extractTextFromTxt, normalizeExtractedText } from '@/lib/ai/text-extractor';

const validPdfString = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 85 >>
stream
BT
/F1 24 Tf
100 700 Td
(Operating Systems: Process Scheduling and Deadlocks) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000224 00000 n 
0000000295 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
419
%%EOF`;

describe('PDF and Text Extractor', () => {
  it('extracts text from plain text buffer', () => {
    const text = 'This is a sample learning material about Operating Systems and Process Scheduling.';
    const res = extractTextFromTxt(Buffer.from(text, 'utf-8'));
    expect(res.text).toContain('Operating Systems');
    expect(res.wordCount).toBeGreaterThan(5);
  });

  it('normalizes extracted text properly', () => {
    const raw = 'Heading 1\r\n\r\n\r\n\r\nSubheading\t\twith spaces \x00\x08';
    const norm = normalizeExtractedText(raw);
    expect(norm).toBe('Heading 1\n\nSubheading with spaces');
  });

  it('extracts text from a real text-based PDF', async () => {
    const pdfBuffer = Buffer.from(validPdfString, 'utf-8');
    const res = await extractTextFromPdf(pdfBuffer);
    expect(res.text).toContain('Operating Systems: Process Scheduling');
    expect(res.pageCount).toBe(1);
  });

  it('throws descriptive error on corrupted PDF', async () => {
    const corruptedBuffer = Buffer.from('not a real pdf content at all', 'utf-8');
    await expect(extractTextFromPdf(corruptedBuffer)).rejects.toThrow('corrupted or has an invalid structure');
  });

  it('throws descriptive error on scanned or image-only PDF with insufficient text', async () => {
    // Minimal PDF with empty text
    const emptyPdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 300 144]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000053 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF';
    await expect(extractTextFromPdf(Buffer.from(emptyPdf))).rejects.toThrow('contains little to no extractable text');
  });
});
