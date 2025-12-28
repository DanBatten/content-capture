import Anthropic from '@anthropic-ai/sdk';
import type { ExtractedContent, AnalysisResult, SourceType } from '@content-capture/core';
import {
  CATEGORIZATION_SYSTEM_PROMPT,
  CATEGORIZATION_USER_PROMPT,
  formatPrompt,
} from './prompts';

export * from './prompts';
export * from './embeddings';

export interface AnalyzerConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 500;

/**
 * Content analyzer using Claude API
 */
export class ContentAnalyzer {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(config?: AnalyzerConfig) {
    const apiKey = config?.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Anthropic API key is required');
    }

    this.client = new Anthropic({ apiKey });
    this.model = config?.model || DEFAULT_MODEL;
    this.maxTokens = config?.maxTokens || DEFAULT_MAX_TOKENS;
  }

  /**
   * Analyze extracted content and return categorization
   */
  async analyze(
    content: ExtractedContent,
    sourceType: SourceType,
    url: string
  ): Promise<AnalysisResult> {
    const userPrompt = formatPrompt(CATEGORIZATION_USER_PROMPT, {
      sourceType,
      url,
      title: content.title,
      description: content.description,
      bodyText: content.bodyText?.slice(0, 3000), // Limit body text
      author: content.authorName || content.authorHandle,
    });

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: CATEGORIZATION_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      });

      // Extract text content from response
      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text response from Claude');
      }

      const result = this.parseResponse(textBlock.text);
      return result;
    } catch (error) {
      console.error('Claude analysis error:', error);
      // Return fallback categorization
      return this.getFallbackAnalysis(content, sourceType);
    }
  }

  private parseResponse(text: string): AnalysisResult {
    // Try to extract JSON from response
    // Claude sometimes includes markdown formatting
    let jsonStr = text.trim();

    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    try {
      const parsed = JSON.parse(jsonStr);

      // Validate and normalize the response
      return {
        summary: String(parsed.summary || '').slice(0, 500),
        topics: this.normalizeArray(parsed.topics, 5),
        discipline: String(parsed.discipline || 'General'),
        useCases: this.normalizeArray(parsed.useCases, 3),
        contentType: this.normalizeContentType(parsed.contentType),
      };
    } catch (parseError) {
      console.error('Failed to parse Claude response:', parseError, text);
      throw new Error('Invalid JSON response from Claude');
    }
  }

  private normalizeArray(arr: unknown, maxLength: number): string[] {
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((item): item is string => typeof item === 'string')
      .slice(0, maxLength);
  }

  private normalizeContentType(
    type: unknown
  ): 'post' | 'article' | 'thread' | 'image' | 'video' {
    const validTypes = ['post', 'article', 'thread', 'image', 'video'];
    if (typeof type === 'string' && validTypes.includes(type.toLowerCase())) {
      return type.toLowerCase() as 'post' | 'article' | 'thread' | 'image' | 'video';
    }
    return 'post';
  }

  private getFallbackAnalysis(
    content: ExtractedContent,
    sourceType: SourceType
  ): AnalysisResult {
    // Basic fallback when Claude fails
    const topics: string[] = [];

    // Simple keyword-based topic detection
    const text = `${content.title || ''} ${content.description || ''} ${content.bodyText || ''}`.toLowerCase();

    if (text.includes('ai') || text.includes('artificial intelligence') || text.includes('machine learning')) {
      topics.push('AI');
    }
    if (text.includes('design') || text.includes('ui') || text.includes('ux')) {
      topics.push('Design');
    }
    if (text.includes('business') || text.includes('startup') || text.includes('company')) {
      topics.push('Business');
    }
    if (text.includes('code') || text.includes('programming') || text.includes('developer')) {
      topics.push('Technology');
    }

    if (topics.length === 0) {
      topics.push('General');
    }

    // Determine content type based on source
    let contentType: 'post' | 'article' | 'thread' | 'image' | 'video' = 'post';
    if (sourceType === 'web' && (content.bodyText?.length || 0) > 1000) {
      contentType = 'article';
    }
    if (content.videos.length > 0) {
      contentType = 'video';
    }
    if (content.images.length > 0 && !content.bodyText) {
      contentType = 'image';
    }

    return {
      summary: content.description || content.title || 'Content saved for later reference.',
      topics,
      discipline: 'General',
      useCases: ['Reference'],
      contentType,
    };
  }
}

/**
 * Create a content analyzer with default configuration
 */
export function createAnalyzer(config?: AnalyzerConfig): ContentAnalyzer {
  return new ContentAnalyzer(config);
}
