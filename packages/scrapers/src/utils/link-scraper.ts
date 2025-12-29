/**
 * Link Scraper Utility
 *
 * Scrapes content from linked URLs for inline storage in platform_data.
 * Handles articles, PDFs, and arxiv papers.
 */

import * as cheerio from 'cheerio';

export interface ScrapedLinkContent {
  url: string;
  title: string | null;
  description: string | null;
  bodyText: string | null;
  contentType: 'article' | 'pdf' | 'arxiv';
  scrapedAt: string;
  error?: string;
}

/**
 * Check if URL is an arxiv paper
 */
export function isArxivUrl(url: string): boolean {
  return url.includes('arxiv.org/abs/') || url.includes('arxiv.org/pdf/');
}

/**
 * Normalize arxiv URL to abstract page
 */
export function normalizeArxivUrl(url: string): string {
  if (url.includes('/pdf/')) {
    return url.replace('/pdf/', '/abs/').replace('.pdf', '');
  }
  return url;
}

/**
 * Scrape an arxiv paper (metadata + PDF content)
 */
export async function scrapeArxiv(url: string): Promise<ScrapedLinkContent> {
  const normalizedUrl = normalizeArxivUrl(url);
  const result: ScrapedLinkContent = {
    url: normalizedUrl,
    title: null,
    description: null,
    bodyText: null,
    contentType: 'arxiv',
    scrapedAt: new Date().toISOString(),
  };

  try {
    // Get metadata from abstract page
    const abstractResponse = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (abstractResponse.ok) {
      const html = await abstractResponse.text();
      const $ = cheerio.load(html);

      result.title =
        $('meta[name="citation_title"]').attr('content') ||
        $('h1.title').text().replace('Title:', '').trim() ||
        null;

      result.description =
        $('meta[name="citation_abstract"]').attr('content') ||
        $('blockquote.abstract').text().replace('Abstract:', '').trim() ||
        null;
    }

    // Get PDF content
    const pdfUrl = normalizedUrl.replace('/abs/', '/pdf/') + '.pdf';

    const pdfParse = (await import('pdf-parse')).default;
    const pdfResponse = await fetch(pdfUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentCapture/1.0)' },
      signal: AbortSignal.timeout(30000),
    });

    if (!pdfResponse.ok) {
      result.error = `PDF HTTP ${pdfResponse.status}`;
      if (result.description) {
        result.bodyText = `Abstract: ${result.description}`;
      }
      return result;
    }

    const buffer = Buffer.from(await pdfResponse.arrayBuffer());
    const data = await pdfParse(buffer);

    const fullText = data.text.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();

    result.bodyText = result.description
      ? `ABSTRACT:\n${result.description}\n\nFULL PAPER:\n${fullText.slice(0, 25000)}`
      : fullText.slice(0, 25000);
  } catch (err) {
    result.error = err instanceof Error ? err.message : 'Unknown error';
  }

  return result;
}

/**
 * Scrape a generic web article
 */
export async function scrapeArticle(url: string): Promise<ScrapedLinkContent> {
  const result: ScrapedLinkContent = {
    url,
    title: null,
    description: null,
    bodyText: null,
    contentType: 'article',
    scrapedAt: new Date().toISOString(),
  };

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
    });

    if (!response.ok) {
      result.error = `HTTP ${response.status}`;
      return result;
    }

    const contentType = response.headers.get('content-type') || '';

    // Handle PDF response
    if (contentType.includes('application/pdf')) {
      result.contentType = 'pdf';
      const pdfParse = (await import('pdf-parse')).default;
      const buffer = Buffer.from(await response.arrayBuffer());
      const data = await pdfParse(buffer);
      result.bodyText = data.text.replace(/\s+/g, ' ').trim().slice(0, 15000);
      return result;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    result.title =
      $('meta[property="og:title"]').attr('content') || $('title').text().trim() || null;

    result.description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      null;

    // Remove non-content elements
    $('script, style, nav, header, footer, aside, .ads, .comments, .sidebar').remove();

    // Try to find main content
    const articleContent =
      $('article, main, .post-content, .entry-content, .article-content, .content, [role="main"]')
        .text() || $('body').text();

    result.bodyText = articleContent.replace(/\s+/g, ' ').trim().slice(0, 10000);
  } catch (err) {
    result.error = err instanceof Error ? err.message : 'Unknown error';
  }

  return result;
}

/**
 * Scrape content from a URL (auto-detects type)
 */
export async function scrapeLink(url: string): Promise<ScrapedLinkContent> {
  if (isArxivUrl(url)) {
    return scrapeArxiv(url);
  }
  return scrapeArticle(url);
}

/**
 * Scrape multiple links with rate limiting
 */
export async function scrapeLinks(
  urls: string[],
  maxLinks = 5,
  delayMs = 500
): Promise<ScrapedLinkContent[]> {
  const results: ScrapedLinkContent[] = [];

  for (const url of urls.slice(0, maxLinks)) {
    const content = await scrapeLink(url);
    results.push(content);

    // Rate limit
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
