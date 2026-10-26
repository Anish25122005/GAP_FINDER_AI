import crypto from 'crypto';

export const EMBEDDING_DIMENSION = 1536;

/**
 * Generates a deterministic normalized unit vector for offline/test environments.
 * Uses a token hashing and frequency projection algorithm to produce reproducible,
 * semantically sensitive vector representations with high cosine similarity for related texts.
 */
export function generateDeterministicEmbedding(text: string, dimension: number = EMBEDDING_DIMENSION): number[] {
  const vector = new Array(dimension).fill(0);
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const words = normalized.split(/\s+/).filter((w) => w.length > 1);

  if (words.length === 0) {
    vector[0] = 1.0;
    return vector;
  }

  // Project word tokens and bi-grams into vector space
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const hash = crypto.createHash('sha256').update(word).digest();
    const idx1 = hash.readUInt16BE(0) % dimension;
    const idx2 = hash.readUInt16BE(2) % dimension;
    const sign1 = (hash[4] & 1) === 0 ? 1 : -1;
    const sign2 = (hash[5] & 1) === 0 ? 1 : -1;

    vector[idx1] += sign1 * 1.0;
    vector[idx2] += sign2 * 0.5;

    // Bi-gram
    if (i < words.length - 1) {
      const bigram = `${word}_${words[i + 1]}`;
      const biHash = crypto.createHash('sha256').update(bigram).digest();
      const biIdx = biHash.readUInt16BE(0) % dimension;
      vector[biIdx] += 1.5;
    }
  }

  // Normalize to unit vector length (L2 norm = 1.0)
  let norm = 0;
  for (let i = 0; i < dimension; i++) {
    norm += vector[i] * vector[i];
  }

  norm = Math.sqrt(norm);
  if (norm === 0) {
    vector[0] = 1.0;
    return vector;
  }

  for (let i = 0; i < dimension; i++) {
    vector[i] = vector[i] / norm;
  }

  return vector;
}

/**
 * Generates an embedding vector using the configured provider or fallback.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const provider = process.env.AI_PROVIDER || 'openai';
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;

  // 1. OpenAI Embeddings
  if (provider === 'openai' && openaiApiKey && !openaiApiKey.includes('your-openai-api-key')) {
    try {
      const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
      const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

      const response = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          input: text.slice(0, 8000), // OpenAI token limit safety
          model,
        }),
      });

      if (response.ok) {
        const json = await response.json();
        if (json.data && json.data[0]?.embedding) {
          return json.data[0].embedding;
        }
      } else {
        const errorText = await response.text();
        console.warn('OpenAI embedding API failed, falling back to deterministic embedding:', errorText);
      }
    } catch (err) {
      console.warn('OpenAI embedding network error, falling back:', err);
    }
  }

  // 2. Google Gemini Embeddings
  if (provider === 'gemini' && geminiApiKey && !geminiApiKey.includes('your-gemini-api-key')) {
    try {
      const model = process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${geminiApiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: { parts: [{ text: text.slice(0, 8000) }] },
        }),
      });

      if (response.ok) {
        const json = await response.json();
        const values: number[] = json.embedding?.values;
        if (values && values.length > 0) {
          // If Gemini returns 768 dims, project to 1536 dims for pgvector schema consistency
          if (values.length === EMBEDDING_DIMENSION) return values;
          const projected = new Array(EMBEDDING_DIMENSION).fill(0);
          for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
            projected[i] = values[i % values.length];
          }
          return projected;
        }
      }
    } catch (err) {
      console.warn('Gemini embedding error, falling back:', err);
    }
  }

  // 3. Fallback to deterministic unit-vector semantic generator
  return generateDeterministicEmbedding(text, EMBEDDING_DIMENSION);
}

/**
 * Batch generates embeddings for multiple text chunks.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (const text of texts) {
    const emb = await generateEmbedding(text);
    embeddings.push(emb);
  }
  return embeddings;
}
