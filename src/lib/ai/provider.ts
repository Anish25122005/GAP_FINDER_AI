import { z } from 'zod';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
}

export class AIProviderError extends Error {
  constructor(message: string, public readonly provider: string, public readonly cause?: any) {
    super(message);
    this.name = 'AIProviderError';
  }
}

/**
 * Sanitizes untrusted user inputs or retrieved content to prevent prompt injection.
 * Escapes markdown code fences and system control tokens.
 */
export function sanitizeUntrustedContent(text: string): string {
  if (!text) return '';
  return text
    .replace(/```/g, "'''")
    .replace(/<\|im_start\|>/g, '')
    .replace(/<\|im_end\|>/g, '')
    .replace(/\[SYSTEM\]/gi, '[SECURE_TAG]');
}

/**
 * Unified AI Provider that interacts with OpenAI, Gemini, or Mock fallback.
 */
export class AIProvider {
  private getProviderName(): string {
    return process.env.AI_PROVIDER || 'openai';
  }

  /**
   * Generates raw text completion.
   */
  async generateText(messages: LLMMessage[], options: CompletionOptions = {}): Promise<string> {
    const provider = this.getProviderName();
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (provider === 'openai' && openaiApiKey && !openaiApiKey.includes('your-openai-api-key')) {
      return this.callOpenAI(messages, options);
    }

    if (provider === 'gemini' && geminiApiKey && !geminiApiKey.includes('your-gemini-api-key')) {
      return this.callGemini(messages, options);
    }

    // Fallback: Return a sensible mocked or heuristic text for tests / offline
    return this.fallbackTextCompletion(messages);
  }

  /**
   * Generates structured output validated against a Zod schema.
   */
  async generateStructuredOutput<T>(
    messages: LLMMessage[],
    schema: z.ZodSchema<T>,
    fallbackGenerator?: () => T,
    options: CompletionOptions = {}
  ): Promise<T> {
    const provider = this.getProviderName();
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    const systemPromptWithJsonInstruction =
      'You are a strict academic analysis AI. Output ONLY valid JSON matching the requested structure. Do not include markdown codeblocks or preamble.';

    const adjustedMessages: LLMMessage[] = [
      { role: 'system', content: systemPromptWithJsonInstruction },
      ...messages,
    ];

    if (
      (provider === 'openai' && openaiApiKey && !openaiApiKey.includes('your-openai-api-key')) ||
      (provider === 'gemini' && geminiApiKey && !geminiApiKey.includes('your-gemini-api-key'))
    ) {
      try {
        const text = await this.generateText(adjustedMessages, {
          ...options,
          responseFormat: 'json',
        });
        const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        const parsed = JSON.parse(cleaned);
        const validated = schema.parse(parsed);
        return validated;
      } catch (err) {
        console.warn('AI structured output parsing failed:', err);
        if (fallbackGenerator) {
          return fallbackGenerator();
        }
        throw new AIProviderError('Failed to parse and validate AI structured response.', provider, err);
      }
    }

    // In offline/test mode:
    if (fallbackGenerator) {
      return fallbackGenerator();
    }

    throw new AIProviderError(
      'No active AI provider configured (OPENAI_API_KEY or GEMINI_API_KEY required for live AI generation).',
      provider
    );
  }

  private async callOpenAI(messages: LLMMessage[], options: CompletionOptions): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const body: any = {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 2000,
    };

    if (options.responseFormat === 'json') {
      body.response_format = { type: 'json_object' };
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new AIProviderError(`OpenAI API error (${res.status}): ${errText}`, 'openai');
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  private async callGemini(messages: LLMMessage[], options: CompletionOptions): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const systemInstruction = messages.find((m) => m.role === 'system');

    const body: any = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxTokens ?? 2000,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction.content }],
      };
    }

    if (options.responseFormat === 'json') {
      body.generationConfig.responseMimeType = 'application/json';
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new AIProviderError(`Gemini API error (${res.status}): ${errText}`, 'gemini');
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  private fallbackTextCompletion(messages: LLMMessage[]): string {
    const lastUserMessage = messages.filter((m) => m.role === 'user').pop()?.content || '';
    return `[Evidence-Grounded Response]: Based strictly on the provided course material, the key principles indicate that students must study foundational architectural patterns and verify each concept against primary source materials.`;
  }
}

export const aiProvider = new AIProvider();
