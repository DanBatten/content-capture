import type { SourceType } from '@content-capture/core';
import type { ContentScraper } from './types';
import { GenericScraper } from './generic';
import { TwitterScraper } from './twitter';
import { InstagramScraper } from './instagram';
import { PdfScraper } from './pdf';

export * from './types';
export { GenericScraper } from './generic';
export { TwitterScraper } from './twitter';
export { InstagramScraper } from './instagram';
export { PdfScraper } from './pdf';
export * from './utils/link-extractor';

/**
 * Scraper registry - manages all available scrapers
 */
export class ScraperRegistry {
  private scrapers: ContentScraper[] = [];
  private genericScraper: GenericScraper;

  constructor(apifyToken?: string) {
    this.genericScraper = new GenericScraper(apifyToken);
  }

  register(scraper: ContentScraper): void {
    this.scrapers.push(scraper);
  }

  /**
   * Get the appropriate scraper for a URL
   * Falls back to generic scraper if no specific scraper matches
   */
  getForUrl(url: string): ContentScraper {
    const scraper = this.scrapers.find((s) => s.canHandle(url));
    return scraper || this.genericScraper;
  }

  /**
   * Get scraper by name
   */
  getByName(name: string): ContentScraper | undefined {
    if (name === 'generic') return this.genericScraper;
    return this.scrapers.find((s) => s.name === name);
  }
}

/**
 * Create a configured scraper registry with all available scrapers
 * Requires environment variables:
 * - APIFY_API_TOKEN: For Twitter/Instagram scrapers AND web page screenshots
 */
export function createScraperRegistry(): ScraperRegistry {
  const apifyToken = process.env.APIFY_API_TOKEN;

  const registry = new ScraperRegistry(apifyToken);

  // PDF scraper (no API needed)
  registry.register(new PdfScraper());

  if (apifyToken) {
    console.log('Apify configured - screenshots and social scrapers enabled');

    try {
      registry.register(new TwitterScraper(apifyToken));
    } catch (e) {
      console.warn('Failed to initialize Twitter scraper:', e);
    }

    try {
      registry.register(new InstagramScraper(apifyToken));
    } catch (e) {
      console.warn('Failed to initialize Instagram scraper:', e);
    }
  } else {
    console.warn('APIFY_API_TOKEN not set - screenshots and social scrapers disabled');
  }

  return registry;
}

/**
 * Get scraper for a specific source type
 * This is a convenience function for when you already know the source type
 */
export function getScraperForSourceType(
  sourceType: SourceType,
  registry?: ScraperRegistry
): ContentScraper {
  const reg = registry || createScraperRegistry();

  switch (sourceType) {
    case 'twitter':
      return reg.getByName('twitter') || reg.getByName('generic')!;
    case 'instagram':
      return reg.getByName('instagram') || reg.getByName('generic')!;
    case 'linkedin':
    case 'pinterest':
    case 'web':
    default:
      return reg.getByName('generic')!;
  }
}
