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

export interface ExtractedContent {
  title?: string;
  description?: string;
  bodyText?: string;
  authorName?: string;
  authorHandle?: string;
  publishedAt?: string;
  images: MediaItem[];
  videos: VideoItem[];
  platformData?: Record<string, unknown>;
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
}
