/**
 * Core types for the content capture system
 */

export type SourceType = 'twitter' | 'instagram' | 'linkedin' | 'pinterest' | 'web';

export type ContentType = 'post' | 'article' | 'thread' | 'image' | 'video';

export type CaptureStatus = 'pending' | 'processing' | 'complete' | 'failed';

export interface MediaItem {
  url: string;
  s3Key?: string;
  width?: number;
  height?: number;
  alt?: string;
}

export interface VideoItem extends MediaItem {
  thumbnail?: string;
  duration?: number;
}

export interface ContentItem {
  id: string;
  sourceUrl: string;
  sourceType: SourceType;

  // Extracted content
  title?: string;
  description?: string;
  bodyText?: string;
  authorName?: string;
  authorHandle?: string;
  publishedAt?: string;

  // Media
  images: MediaItem[];
  videos: VideoItem[];

  // AI Analysis
  summary?: string;
  topics: string[];
  disciplines: string[];
  useCases: string[];
  contentType?: ContentType;

  // Platform-specific metadata
  platformData?: Record<string, unknown>;

  // Notion sync
  notionPageId?: string;
  notionSyncedAt?: string;

  // Status
  status: CaptureStatus;
  errorMessage?: string;

  // Timestamps
  capturedAt: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CaptureRequest {
  url: string;
  notes?: string;
}

export interface CaptureResponse {
  id: string;
  status: CaptureStatus;
  sourceType: SourceType;
}

export interface ThreadContext {
  parentTweetId?: string;
  parentAuthor?: string;
  isThreadContinuation: boolean;
}

export interface ExtractedContent {
  title?: string;
  description?: string;
  bodyText?: string;
  authorName?: string;
  authorHandle?: string;
  publishedAt?: string;
  images: MediaItem[];
  videos: VideoItem[];
  screenshot?: string; // URL of page screenshot
  platformData?: Record<string, unknown>;
  threadContext?: ThreadContext;
}

export interface AnalysisResult {
  summary: string;
  topics: string[];
  discipline: string;
  useCases: string[];
  contentType: ContentType;
}

export interface ContentScraper {
  name: string;
  canHandle(url: string): boolean;
  scrape(url: string): Promise<ExtractedContent>;
}

// Queue message types
export interface CaptureMessage {
  captureId: string;
  url: string;
  sourceType: SourceType;
  notes?: string;
  userId?: string;
  traceId?: string;
}

// =============================================================================
// Notes Types
// =============================================================================

export type NoteStatus = 'pending' | 'processing' | 'complete' | 'failed';

/**
 * Request payload for creating a new note
 */
export interface NoteRequest {
  text: string;
  idempotencyKey?: string; // UUID from client for deduplication
}

/**
 * Pub/Sub message for note processing
 */
export interface NoteMessage {
  noteId: string;
  userId: string;
  traceId: string;
}

/**
 * Note entity matching database schema
 */
export interface Note {
  id: string;
  userId: string;

  // Content
  rawText: string;
  cleanedText?: string;
  expandedText?: string;
  title?: string;
  shortTitle?: string;

  // Idempotency
  contentHash?: string;

  // Thumbnail
  backgroundImage?: string;
  thumbnailUrl?: string;

  // AI Analysis
  summary?: string;
  topics: string[];
  disciplines: string[];
  useCases: string[];

  // LLM metadata
  llmWarnings?: string[];
  llmModel?: string;
  llmPromptVersion?: string;

  // Embedding
  embedding?: number[];
  embeddingGeneratedAt?: string;

  // Metadata
  platformData?: Record<string, unknown>;

  // Status
  status: NoteStatus;
  errorMessage?: string;
  processingAttempts: number;

  // Timestamps
  createdAt: string;
  updatedAt: string;
  processedAt?: string;
}

/**
 * Result from NoteAnalyzer LLM processing
 */
export interface NoteAnalysisResult {
  cleanedText: string;
  expandedText?: string;
  mainTitle: string;
  shortTitle: string;
  warnings: string[];
  llmMeta: {
    model: string;
    promptVersion: string;
  };
}

/**
 * Response from creating a note
 */
export interface NoteResponse {
  id: string;
  status: NoteStatus;
  existing?: boolean; // true if deduplicated to existing note
}
