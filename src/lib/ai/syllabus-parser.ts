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
  units: z.array(TopicNodeSchema),
});

export type SyllabusParseResult = z.infer<typeof SyllabusParseSchema>;

/**
 * Structural outline parser using heuristics when LLM is unavailable or as a baseline.
 */
export function parseSyllabusStructure(text: string): ParsedTopicNode[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const units: ParsedTopicNode[] = [];
  let currentUnit: ParsedTopicNode | null = null;
  let currentTopic: ParsedTopicNode | null = null;
  let unitIndex = 0;
  let topicIndex = 0;
  let subtopicIndex = 0;

  for (const line of lines) {
    // Check if line represents Unit / Module / Chapter (Level 1)
    const unitMatch = line.match(/^(?:Unit|Module|Chapter|Part)\s*([0-9IVXLC]+)?\s*[:.-]?\s*(.+)/i);
    if (unitMatch) {
      unitIndex++;
      topicIndex = 0;
      currentUnit = {
        name: unitMatch[2]?.trim() || line,
        code: unitMatch[1] ? `U${unitMatch[1]}` : `U${unitIndex}`,
        level: 1,
        weight: 1.0,
        orderIndex: unitIndex,
        children: [],
      };
      units.push(currentUnit);
      currentTopic = null;
      continue;
    }

    // Check if line represents numbered Topic (Level 2): "1.1 Linear Regression", "Topic 2: ..."
    const topicMatch = line.match(/^(\d+(?:\.\d+)?)\s*[:.-]?\s*(.+)/);
    if (topicMatch) {
      topicIndex++;
      subtopicIndex = 0;
      const topicName = topicMatch[2].trim();
      currentTopic = {
        name: topicName,
        code: topicMatch[1],
        level: 2,
        weight: 1.0,
        orderIndex: topicIndex,
        children: [],
      };

      if (!currentUnit) {
        // Create an implicit Unit 1 if none found
        unitIndex++;
        currentUnit = {
          name: 'Core Curriculum',
          code: `U${unitIndex}`,
          level: 1,
          weight: 1.0,
          orderIndex: unitIndex,
          children: [],
        };
        units.push(currentUnit);
      }

      currentUnit.children = currentUnit.children || [];
      currentUnit.children.push(currentTopic);
      continue;
    }

    // Bullet points (Level 3 or Level 2 if no current topic)
    const bulletMatch = line.match(/^[-*•]\s+(.+)/);
    if (bulletMatch) {
      subtopicIndex++;
      const itemText = bulletMatch[1].trim();

      if (currentTopic) {
        currentTopic.children = currentTopic.children || [];
        currentTopic.children.push({
          name: itemText,
          level: 3,
          weight: 1.0,
          orderIndex: subtopicIndex,
        });
      } else if (currentUnit) {
        topicIndex++;
        currentTopic = {
          name: itemText,
          level: 2,
          weight: 1.0,
          orderIndex: topicIndex,
          children: [],
        };
        currentUnit.children = currentUnit.children || [];
        currentUnit.children.push(currentTopic);
      }
      continue;
    }

    // Fallback: regular non-bullet line if it's short and looks like a title
    if (line.length < 60 && !line.endsWith('.')) {
      if (!currentUnit) {
        unitIndex++;
        currentUnit = {
          name: line,
          code: `U${unitIndex}`,
          level: 1,
          weight: 1.0,
          orderIndex: unitIndex,
          children: [],
        };
        units.push(currentUnit);
      } else {
        topicIndex++;
        currentTopic = {
          name: line,
          level: 2,
          weight: 1.0,
          orderIndex: topicIndex,
          children: [],
        };
        currentUnit.children = currentUnit.children || [];
        currentUnit.children.push(currentTopic);
      }
    }
  }

  return units;
}

/**
 * Extracts a structured topic hierarchy from syllabus text using LLM with deterministic fallback.
 */
export async function parseSyllabus(text: string): Promise<ParsedTopicNode[]> {
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
4. Output a JSON object with a "units" array matching the requested schema.

Syllabus Text:
<<<UNTRUSTED_SYLLABUS_CONTENT>>>
${sanitized}
<<<UNTRUSTED_SYLLABUS_CONTENT>>>
`;

  const fallback = () => {
    const structural = parseSyllabusStructure(text);
    if (structural.length > 0) return { units: structural };

    // Absolute fallback for plain minimal text
    return {
      units: [
        {
          name: 'Core Curriculum',
          code: 'U1',
          level: 1,
          weight: 1.0,
          orderIndex: 1,
          children: [
            {
              name: 'General Syllabus Topics',
              code: '1.1',
              level: 2,
              weight: 1.0,
              orderIndex: 1,
              children: [],
            },
          ],
        },
      ],
    };
  };

  try {
    const result = await aiProvider.generateStructuredOutput(
      [{ role: 'user', content: prompt }],
      SyllabusParseSchema,
      fallback
    );
    return result.units;
  } catch {
    return fallback().units;
  }
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
