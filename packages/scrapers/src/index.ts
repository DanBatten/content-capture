import type { SourceType } from '@content-capture/core';
import type { ContentScraper } from './types';
import { GenericScraper } from './generic';
import { TwitterScraper } from './twitter';
import { InstagramScraper } from './instagram';

export * from './types';
export { GenericScraper } from './generic';
export { TwitterScraper } from './twitter';
export { InstagramScraper } from './instagram';

/**
 * Scraper registry - manages all available scrapers
 */
export class ScraperRegistry {
  private scrapers: ContentScraper[] = [];
  private genericScraper: GenericScraper;

  constructor() {
    this.genericScraper = new GenericScraper();
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
 * - APIFY_API_TOKEN: For Twitter and Instagram scrapers
 */
export function createScraperRegistry(): ScraperRegistry {
  const registry = new ScraperRegistry();

  // Only register platform scrapers if API token is available
  const apifyToken = process.env.APIFY_API_TOKEN;

  if (apifyToken) {
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
    console.warn('APIFY_API_TOKEN not set - Twitter and Instagram scrapers disabled');
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
