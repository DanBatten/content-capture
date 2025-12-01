import * as cheerio from 'cheerio';
import type { ExtractedContent, MediaItem } from '@content-capture/core';
import type { ContentScraper, ScraperOptions } from './types';

/**
 * Generic web scraper using fetch + cheerio
 * Extracts Open Graph metadata, title, description, and main content
 */
export class GenericScraper implements ContentScraper {
  name = 'generic';

  canHandle(_url: string): boolean {
    // Generic scraper can handle any URL as a fallback
    return true;
  }

  async scrape(url: string, options?: ScraperOptions): Promise<ExtractedContent> {
    const timeout = options?.timeout || 15000;
    const maxImages = options?.maxImages || 10;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Extract Open Graph metadata
      const ogTitle = $('meta[property="og:title"]').attr('content');
      const ogDescription = $('meta[property="og:description"]').attr('content');
      const ogImage = $('meta[property="og:image"]').attr('content');
      const ogType = $('meta[property="og:type"]').attr('content');

      // Twitter Card metadata
      const twitterTitle = $('meta[name="twitter:title"]').attr('content');
      const twitterDescription = $('meta[name="twitter:description"]').attr('content');
      const twitterImage = $('meta[name="twitter:image"]').attr('content');
      const twitterCreator = $('meta[name="twitter:creator"]').attr('content');

      // Standard metadata
      const title = ogTitle || twitterTitle || $('title').text().trim() || undefined;
      const description =
        ogDescription ||
        twitterDescription ||
        $('meta[name="description"]').attr('content') ||
        undefined;

      // Author extraction
      const authorMeta =
        $('meta[name="author"]').attr('content') ||
        $('meta[property="article:author"]').attr('content');
      const authorName = authorMeta || twitterCreator?.replace('@', '') || undefined;
      const authorHandle = twitterCreator || undefined;

      // Published date
      const publishedAt =
        $('meta[property="article:published_time"]').attr('content') ||
        $('time[datetime]').attr('datetime') ||
        undefined;

      // Extract main content text
      // Remove script, style, nav, footer, header elements
      $('script, style, nav, footer, header, aside, .sidebar, .comments').remove();

      // Try to find main content area
      const mainContent =
        $('article').text() ||
        $('main').text() ||
        $('[role="main"]').text() ||
        $('body').text();

      const bodyText = mainContent.replace(/\s+/g, ' ').trim().slice(0, 5000) || undefined;

      // Extract images
      const images: MediaItem[] = [];
      const seenUrls = new Set<string>();

      // Add OG image first if present
      if (ogImage && !seenUrls.has(ogImage)) {
        images.push({ url: this.resolveUrl(ogImage, url) });
        seenUrls.add(ogImage);
      }

      // Add Twitter image if different
      if (twitterImage && !seenUrls.has(twitterImage)) {
        images.push({ url: this.resolveUrl(twitterImage, url) });
        seenUrls.add(twitterImage);
      }

      // Extract images from content
      $('img').each((_, el) => {
        if (images.length >= maxImages) return false;

        const src = $(el).attr('src');
        const dataSrc = $(el).attr('data-src');
        const imgUrl = src || dataSrc;

        if (imgUrl && !seenUrls.has(imgUrl) && this.isValidImageUrl(imgUrl)) {
          const resolvedUrl = this.resolveUrl(imgUrl, url);
          images.push({
            url: resolvedUrl,
            alt: $(el).attr('alt') || undefined,
            width: parseInt($(el).attr('width') || '0') || undefined,
            height: parseInt($(el).attr('height') || '0') || undefined,
          });
          seenUrls.add(imgUrl);
        }
      });

      // Extract video (basic OG video support)
      const ogVideo = $('meta[property="og:video"]').attr('content');
      const videos = ogVideo
        ? [
            {
              url: ogVideo,
              thumbnail: ogImage || undefined,
            },
          ]
        : [];

      return {
        title,
        description,
        bodyText,
        authorName,
        authorHandle,
        publishedAt,
        images,
        videos,
        platformData: {
          ogType,
          canonicalUrl: $('link[rel="canonical"]').attr('href'),
        },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private resolveUrl(urlStr: string, baseUrl: string): string {
    try {
      return new URL(urlStr, baseUrl).href;
    } catch {
      return urlStr;
    }
  }

  private isValidImageUrl(url: string): boolean {
    // Filter out tracking pixels, icons, etc.
    if (url.includes('data:')) return false;
    if (url.includes('tracking')) return false;
    if (url.includes('pixel')) return false;
    if (url.includes('1x1')) return false;
    if (url.match(/\.(svg|gif)$/i)) return false; // Skip SVGs and GIFs for now

    return true;
  }
}
