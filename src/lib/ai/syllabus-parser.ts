import { z } from 'zod';
import { aiProvider, sanitizeUntrustedContent } from './provider';
import type { Topic } from '@/lib/types';

export interface ParsedTopicNode {
  name: string;
  code?: string;
  level: number; // 1 = Unit/Module, 2 = Main Topic, 3 = Subtopic
  description?: string;
  weight?: number;
  orderIndex: number;
  children?: ParsedTopicNode[];
}

const TopicNodeSchema: z.ZodType<ParsedTopicNode> = z.lazy(() =>
  z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    level: z.number().int().min(1).max(3),
    description: z.string().optional(),
    weight: z.number().default(1.0),
    orderIndex: z.number().int().default(0),
    children: z.array(TopicNodeSchema).optional(),
  })
);

export const SyllabusParseSchema = z.object({
  subjectName: z.string().optional(),
  objectives: z.array(z.string()).optional(),
  units: z.array(TopicNodeSchema),
});

export type SyllabusParseResult = z.infer<typeof SyllabusParseSchema>;

/**
 * Normalizes syllabus text by standardizing Unicode dashes, spaces, and line breaks.
 */
export function normalizeSyllabusText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u2013\u2014\u2212\u2010\u2011\u2012\uFE63\uFF0D]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/(\w+)-\s*\n\s*(\w+)/g, '$1-$2');
}

/**
 * Extracts introductory sections such as Course Objectives, Course Outcomes, and Prerequisites
 * from syllabus text so they remain separate from actual curriculum units.
 */
export function extractSyllabusMetadata(text: string): {
  cleanedText: string;
  objectives: string[];
  courseOutcomes: string[];
  prerequisites: string[];
} {
  const normalized = normalizeSyllabusText(text);

  // Find the start of the first unit header
  const unitRegex = /(?:^|\n)[ \t]*(?:UNIT|MODULE|CHAPTER|PART)[ \t]*[-:]?[ \t]*([0-9IVXLC]+)[ \t]*[:.-]?[ \t]*([^\r\n]*)/i;
  const match = unitRegex.exec(normalized);

  const introText = match ? normalized.slice(0, match.index).trim() : '';
  const bodyText = match ? normalized.slice(match.index).trim() : normalized;

  const objectives: string[] = [];
  const courseOutcomes: string[] = [];
  const prerequisites: string[] = [];

  if (introText) {
    const objMatch = introText.match(
      /(?:Course\s+)?Objectives?\s*:\s*([^]+?)(?=(?:Course\s+)?(?:Outcomes?|Prerequisites?|Description)|$)/i
    );
    if (objMatch) {
      const objLines = objMatch[1]
        .split('\n')
        .map((l) => l.trim().replace(/^[-*•]\s*/, ''))
        .filter(Boolean)
        .join(' ');
      if (objLines) objectives.push(objLines);
    }

    const outMatch = introText.match(
      /(?:Course\s+)?Outcomes?\s*:\s*([^]+?)(?=(?:Course\s+)?(?:Objectives?|Prerequisites?|Description)|$)/i
    );
    if (outMatch) {
      const outLines = outMatch[1]
        .split('\n')
        .map((l) => l.trim().replace(/^[-*•]\s*/, ''))
        .filter(Boolean)
        .join(' ');
      if (outLines) courseOutcomes.push(outLines);
    }

    const preMatch = introText.match(
      /Prerequisites?\s*:\s*([^]+?)(?=(?:Course\s+)?(?:Objectives?|Outcomes?|Description)|$)/i
    );
    if (preMatch) {
      const preLines = preMatch[1]
        .split('\n')
        .map((l) => l.trim().replace(/^[-*•]\s*/, ''))
        .filter(Boolean)
        .join(' ');
      if (preLines) prerequisites.push(preLines);
    }
  }

  return {
    cleanedText: bodyText,
    objectives,
    courseOutcomes,
    prerequisites,
  };
}

/**
 * Extracts Level 2 topics and Level 3 subtopics from a single unit's body text.
 */
export function extractTopicsFromUnitText(unitBody: string, unitIndex: number): ParsedTopicNode[] {
  const cleanBody = unitBody.trim();
  if (!cleanBody) return [];

  // Normalize hyphenated words across line breaks
  const text = cleanBody.replace(/(\w+)-\s*\n\s*(\w+)/g, '$1-$2');

  // Headings pattern: Captures "Heading Name:" that starts after newline, punctuation, or lowercase word boundary
  const headingRegex = /(?:^|\n|[.;]|(?<=[a-z0-9]\s))\s*([A-Z][A-Za-z0-9\s/&-]{1,45}?):[ \t]*/g;

  const headings: { name: string; index: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headingRegex.exec(text)) !== null) {
    const rawName = m[1].trim();
    if (/^(Note|Eg|Ie|Fig|Figure|Ref|Reference|Unit|Module|Chapter)$/i.test(rawName)) continue;
    if (/^[0-9]+$/.test(rawName)) continue;

    headings.push({
      name: rawName,
      index: m.index,
      end: m.index + m[0].length,
    });
  }

  if (headings.length > 0) {
    const topics: ParsedTopicNode[] = [];
    for (let i = 0; i < headings.length; i++) {
      const h = headings[i];
      const nextIndex = i < headings.length - 1 ? headings[i + 1].index : text.length;
      const rawContent = text.slice(h.end, nextIndex).trim().replace(/\s+/g, ' ');

      const subtopicStrings = rawContent
        .split(/[,;]/)
        .map((s) => s.replace(/[.]\s*$/, '').trim())
        .filter((s) => s.length > 1 && !/^[.;:-]+$/.test(s));

      const subtopics: ParsedTopicNode[] = subtopicStrings.map((sub, sIdx) => ({
        name: sub,
        level: 3,
        orderIndex: sIdx + 1,
        weight: 1.0,
      }));

      topics.push({
        name: h.name,
        code: `${unitIndex}.${i + 1}`,
        level: 2,
        orderIndex: i + 1,
        weight: 1.0,
        children: subtopics,
      });
    }
    return topics;
  }

  // Fallback 1: Line by line with bullets or numbering
  const lines = cleanBody.split('\n').map((l) => l.trim()).filter(Boolean);
  const topics: ParsedTopicNode[] = [];
  let tIndex = 0;
  for (const line of lines) {
    const cleaned = line.replace(/^[-*•]\s*/, '').replace(/^\d+(?:\.\d+)?\s*[:.-]?\s*/, '').trim();
    if (cleaned.length > 2 && cleaned.length < 120 && !cleaned.endsWith('.')) {
      tIndex++;
      topics.push({
        name: cleaned,
        code: `${unitIndex}.${tIndex}`,
        level: 2,
        orderIndex: tIndex,
        weight: 1.0,
        children: [],
      });
    }
  }

  if (topics.length > 0) return topics;

  // Fallback 2: Split by sentence delimiters
  const sentences = cleanBody
    .split(/[.;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3 && s.length < 120);

  return sentences.map((s, idx) => ({
    name: s,
    code: `${unitIndex}.${idx + 1}`,
    level: 2,
    orderIndex: idx + 1,
    weight: 1.0,
    children: [],
  }));
}

/**
 * Structural outline parser using heuristics when LLM is unavailable or as a baseline.
 */
export function parseSyllabusStructure(text: string): ParsedTopicNode[] {
  const meta = extractSyllabusMetadata(text);
  const normalized = meta.cleanedText || normalizeSyllabusText(text);

  // Match Unit headings including: UNIT-I, UNIT I, UNIT–III, Unit 1, Module 1, Chapter 1
  const unitRegex = /(?:^|\n)[ \t]*(?:UNIT|MODULE|CHAPTER|PART)[ \t]*[-:]?[ \t]*([0-9IVXLC]+)[ \t]*[:.-]?[ \t]*([^\r\n]*)/gi;

  const matches: {
    fullMatch: string;
    index: number;
    num: string;
    title: string;
  }[] = [];

  let match: RegExpExecArray | null;
  while ((match = unitRegex.exec(normalized)) !== null) {
    matches.push({
      fullMatch: match[0],
      index: match.index,
      num: match[1].trim(),
      title: match[2]?.trim() || '',
    });
  }

  // If no unit boundaries detected, return single core unit
  if (matches.length === 0) {
    const topics = extractTopicsFromUnitText(normalized, 1);
    return [
      {
        name: 'Core Curriculum',
        code: 'U1',
        level: 1,
        weight: 1.0,
        orderIndex: 1,
        children:
          topics.length > 0
            ? topics
            : [
                {
                  name: 'General Topics',
                  code: '1.1',
                  level: 2,
                  weight: 1.0,
                  orderIndex: 1,
                  children: [],
                },
              ],
      },
    ];
  }

  const units: ParsedTopicNode[] = [];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index + m.fullMatch.length;
    const end = i < matches.length - 1 ? matches[i + 1].index : normalized.length;
    const body = normalized.slice(start, end).trim();

    const unitOrder = i + 1;
    const unitCode = m.num.startsWith('U') ? m.num : `U${m.num}`;
    const unitName = m.title ? `Unit ${m.num}: ${m.title}` : `Unit ${m.num}`;

    const children = extractTopicsFromUnitText(body, unitOrder);

    units.push({
      name: unitName,
      code: unitCode,
      level: 1,
      weight: 1.0,
      orderIndex: unitOrder,
      children,
    });
  }

  return units;
}

/**
 * Extracts structured topic hierarchy along with syllabus metadata (objectives, etc.)
 */
export async function parseSyllabusWithMetadata(text: string): Promise<{
  units: ParsedTopicNode[];
  objectives: string[];
  courseOutcomes: string[];
  prerequisites: string[];
}> {
  const meta = extractSyllabusMetadata(text);
  const units = await parseSyllabus(text);
  return {
    units,
    objectives: meta.objectives,
    courseOutcomes: meta.courseOutcomes,
    prerequisites: meta.prerequisites,
  };
}

/**
 * Extracts a structured topic hierarchy from syllabus text using LLM with deterministic fallback.
 */
export async function parseSyllabus(text: string): Promise<ParsedTopicNode[]> {
  const meta = extractSyllabusMetadata(text);
  const structural = parseSyllabusStructure(meta.cleanedText || text);

  if (process.env.AI_PROVIDER !== 'mock') {
    const sanitized = sanitizeUntrustedContent(text.slice(0, 15000));
    const prompt = `
You are an expert curriculum architect. Analyze the following syllabus text and extract a clean hierarchical topic map.
Structure:
Level 1: Units / Modules / Major Themes
Level 2: Main Topics within that Unit
Level 3: Specific Subtopics or Concepts (optional)

Rules:
1. Ground the hierarchy ONLY in the provided syllabus text.
2. Do not invent topics or units not supported by the text.
3. Keep names clear and concise.
4. Separate introductory objectives/outcomes from numbered units.
5. Output a JSON object with a "units" array matching the requested schema.

Syllabus Text:
<<<UNTRUSTED_SYLLABUS_CONTENT>>>
${sanitized}
<<<UNTRUSTED_SYLLABUS_CONTENT>>>
`;

    try {
      const result = await aiProvider.generateStructuredOutput(
        [{ role: 'user', content: prompt }],
        SyllabusParseSchema,
        () => ({ units: structural })
      );
      if (result && result.units && result.units.length > 0) {
        return result.units;
      }
    } catch {
      // fallback to deterministic structural parser
    }
  }

  return structural;
}

/**
 * Flattens the hierarchical topic tree into flat Topic objects with parentId references.
 */
export function flattenTopicTree(
  nodes: ParsedTopicNode[],
  subjectId: string,
  userId: string
): Omit<Topic, 'id' | 'createdAt'>[] {
  const result: Omit<Topic, 'id' | 'createdAt'>[] = [];

  // Generate deterministic temporary IDs for parent-child relationship resolution
  const assignIds = (
    list: ParsedTopicNode[],
    parentId: string | null = null,
    level = 1
  ) => {
    list.forEach((node, idx) => {
      const tempId = `temp_${level}_${idx}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const topicObj: any = {
        _tempId: tempId,
        subjectId,
        userId,
        parentId,
        name: node.name,
        code: node.code,
        level: node.level || level,
        description: node.description,
        weight: node.weight || 1.0,
        orderIndex: node.orderIndex || idx + 1,
      };

      result.push(topicObj);

      if (node.children && node.children.length > 0) {
        assignIds(node.children, tempId, (node.level || level) + 1);
      }
    });
  };

  assignIds(nodes, null, 1);
  return result;
}
