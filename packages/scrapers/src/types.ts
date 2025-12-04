import type { ExtractedContent } from '@content-capture/core';

export interface ScraperOptions {
  timeout?: number;
  maxImages?: number;
  includeComments?: boolean;
  takeScreenshot?: boolean;
}

export interface ContentScraper {
  name: string;
  canHandle(url: string): boolean;
  scrape(url: string, options?: ScraperOptions): Promise<ExtractedContent>;
}

export interface ApifyConfig {
  apiToken: string;
}

export interface BrowserlessConfig {
  apiToken: string;
  endpoint?: string;
}
