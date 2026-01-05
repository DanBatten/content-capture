import Anthropic from '@anthropic-ai/sdk';
import type { NoteAnalysisResult } from '@content-capture/core';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 2000;
const PROMPT_VERSION = '1.0';

/**
 * System prompt for note analysis
 * Key principles:
 * - STRICT JSON output only
 * - NO added facts or intent
 * - Preserve writer's voice
 * - cleanedText: grammar/punctuation only
 * - expandedText: OPTIONAL, conservative
 * - Warnings for unclear elements
 */
const NOTE_SYSTEM_PROMPT = `You are a note processing assistant. Your job is to clean up and title raw notes while preserving the writer's voice and intent.

## Critical Rules

1. OUTPUT STRICT JSON ONLY - no markdown, no explanations, just the JSON object
2. NEVER add facts, claims, or intent not present in the original note
3. PRESERVE the writer's voice - don't make it sound generic or AI-written
4. cleanedText is MINIMAL: fix grammar, punctuation, typos only - NO rewording
5. expandedText is OPTIONAL: only provide if note is very terse AND expansion adds clarity
6. If you expand, use phrases like "the idea being that..." to show interpretation

## Output Fields

- cleanedText (required): Original note with grammar/punctuation fixes only. Do NOT rephrase.
- expandedText (optional): Slightly expanded version IF the note is very brief (<50 words) and benefits from gentle clarification. Omit if not needed. Must be clearly interpretive.
- mainTitle (required): 5-10 word title capturing the core idea
- shortTitle (required): 1-3 word label for thumbnail (max 32 chars)
- warnings (required): Array of issues found, e.g., "unclear acronym: 'PTA'", "ambiguous reference: 'that system'"

## Examples

Input: "just realized AI agents shud be modular not monolithic - like microservices for autonomous systems"

Output:
{
  "cleanedText": "Just realized AI agents should be modular, not monolithic - like microservices for autonomous systems.",
  "expandedText": null,
  "mainTitle": "AI Agents Should Follow Microservices Architecture",
  "shortTitle": "Modular AI",
  "warnings": []
}

Input: "PTA meeting idea: what if we did the thing like sarah mentioned"

Output:
{
  "cleanedText": "PTA meeting idea: what if we did the thing like Sarah mentioned?",
  "expandedText": "PTA meeting idea: explore the approach that Sarah suggested (the specific proposal is unclear from this note).",
  "mainTitle": "PTA Meeting - Follow Up on Sarah's Suggestion",
  "shortTitle": "PTA Idea",
  "warnings": ["unclear reference: 'the thing'", "unclear context: what Sarah mentioned"]
}`;

const NOTE_USER_PROMPT = `Process this note and return the JSON output:

---
{rawText}
---

Return ONLY valid JSON with these fields:
{
  "cleanedText": "string (required)",
  "expandedText": "string or null (optional)",
  "mainTitle": "string (required, 5-10 words)",
  "shortTitle": "string (required, 1-3 words, max 32 chars)",
  "warnings": ["array of strings"]
}`;

export interface NoteAnalyzerConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

/**
 * Note analyzer for processing raw text notes
 */
export class NoteAnalyzer {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(config?: NoteAnalyzerConfig) {
    const apiKey = config?.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Anthropic API key is required');
    }

    this.client = new Anthropic({ apiKey });
    this.model = config?.model || DEFAULT_MODEL;
    this.maxTokens = config?.maxTokens || DEFAULT_MAX_TOKENS;
  }

  /**
   * Process a raw note and extract structured data
   */
  async processNote(rawText: string): Promise<NoteAnalysisResult> {
    const userPrompt = NOTE_USER_PROMPT.replace('{rawText}', rawText);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: NOTE_SYSTEM_PROMPT,
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

      const result = this.parseResponse(textBlock.text, rawText);
      return result;
    } catch (error) {
      console.error('Note analysis error:', error);
      // Return minimal fallback
      return this.getFallbackAnalysis(rawText);
    }
  }

  private parseResponse(text: string, rawText: string): NoteAnalysisResult {
    // Clean up response - remove markdown if present
    let jsonStr = text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    try {
      const parsed = JSON.parse(jsonStr);

      // Validate and normalize
      const cleanedText = String(parsed.cleanedText || rawText);
      const mainTitle = this.validateTitle(parsed.mainTitle, rawText);
      const shortTitle = this.validateShortTitle(parsed.shortTitle, mainTitle);

      return {
        cleanedText,
        expandedText: parsed.expandedText || undefined,
        mainTitle,
        shortTitle,
        warnings: this.normalizeWarnings(parsed.warnings),
        llmMeta: {
          model: this.model,
          promptVersion: PROMPT_VERSION,
        },
      };
    } catch (parseError) {
      console.error('Failed to parse note analysis response:', parseError, text);
      return this.getFallbackAnalysis(rawText);
    }
  }

  private validateTitle(title: unknown, rawText: string): string {
    if (typeof title === 'string' && title.length > 0 && title.length <= 120) {
      return title;
    }
    // Generate simple fallback title from first words
    const words = rawText.split(/\s+/).slice(0, 8);
    return words.join(' ') + (rawText.split(/\s+/).length > 8 ? '...' : '');
  }

  private validateShortTitle(shortTitle: unknown, mainTitle: string): string {
    if (typeof shortTitle === 'string' && shortTitle.length > 0 && shortTitle.length <= 32) {
      return shortTitle;
    }
    // Extract first 2-3 significant words from main title
    const words = mainTitle.split(/\s+/).filter(w => w.length > 2).slice(0, 2);
    return words.join(' ').slice(0, 32);
  }

  private normalizeWarnings(warnings: unknown): string[] {
    if (!Array.isArray(warnings)) return [];
    return warnings
      .filter((item): item is string => typeof item === 'string')
      .slice(0, 10);
  }

  private getFallbackAnalysis(rawText: string): NoteAnalysisResult {
    // Minimal fallback when LLM fails
    const words = rawText.trim().split(/\s+/);
    const titleWords = words.slice(0, 8);
    const shortWords = words.slice(0, 2);

    return {
      cleanedText: rawText.trim(),
      expandedText: undefined,
      mainTitle: titleWords.join(' ') + (words.length > 8 ? '...' : ''),
      shortTitle: shortWords.join(' ').slice(0, 32),
      warnings: ['Note processed with fallback - LLM analysis failed'],
      llmMeta: {
        model: this.model,
        promptVersion: PROMPT_VERSION,
      },
    };
  }
}

/**
 * Create a note analyzer with default configuration
 */
export function createNoteAnalyzer(config?: NoteAnalyzerConfig): NoteAnalyzer {
  return new NoteAnalyzer(config);
}
