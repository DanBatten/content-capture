import OpenAI from 'openai';

const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_DIMENSIONS = 1536;
const MAX_INPUT_TOKENS = 8191;

export interface EmbeddingsConfig {
  apiKey?: string;
  model?: string;
  dimensions?: number;
}

export interface EmbeddingInput {
  title?: string;
  description?: string;
  bodyText?: string;
  summary?: string;
  topics?: string[];
  authorName?: string;
}

/**
 * Embeddings generator using OpenAI API
 */
export class EmbeddingsGenerator {
  private client: OpenAI;
  private model: string;
  private dimensions: number;

  constructor(config?: EmbeddingsConfig) {
    const apiKey = config?.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key is required for embeddings');
    }

    this.client = new OpenAI({ apiKey });
    this.model = config?.model || DEFAULT_MODEL;
    this.dimensions = config?.dimensions || DEFAULT_DIMENSIONS;
  }

  /**
   * Generate embedding for text content
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // Truncate to approximate token limit (4 chars per token rough estimate)
    const truncatedText = text.slice(0, MAX_INPUT_TOKENS * 4);

    const response = await this.client.embeddings.create({
      model: this.model,
      input: truncatedText,
      dimensions: this.dimensions,
    });

    const embedding = response.data[0]?.embedding;
    if (!embedding) {
      throw new Error('No embedding returned from OpenAI');
    }
    return embedding;
  }

  /**
   * Prepare text for embedding from content fields
   * Combines relevant fields with structure for better semantic representation
   */
  prepareTextForEmbedding(input: EmbeddingInput): string {
    const parts: string[] = [];

    if (input.title) {
      parts.push(`Title: ${input.title}`);
    }

    if (input.summary) {
      parts.push(`Summary: ${input.summary}`);
    }

    if (input.description && input.description !== input.summary) {
      parts.push(`Description: ${input.description}`);
    }

    if (input.authorName) {
      parts.push(`Author: ${input.authorName}`);
    }

    if (input.topics && input.topics.length > 0) {
      parts.push(`Topics: ${input.topics.join(', ')}`);
    }

    if (input.bodyText) {
      // Limit body text to leave room for other fields
      const bodyLimit = 10000;
      const truncatedBody = input.bodyText.slice(0, bodyLimit);
      parts.push(`Content: ${truncatedBody}`);
    }

    return parts.join('\n\n');
  }

  /**
   * Generate embedding for content with prepared text
   */
  async generateContentEmbedding(input: EmbeddingInput): Promise<number[]> {
    const text = this.prepareTextForEmbedding(input);
    return this.generateEmbedding(text);
  }
}

/**
 * Create an embeddings generator with default configuration
 */
export function createEmbeddingsGenerator(config?: EmbeddingsConfig): EmbeddingsGenerator {
  return new EmbeddingsGenerator(config);
}
