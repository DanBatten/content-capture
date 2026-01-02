import pdfParse from 'pdf-parse';
import * as cheerio from 'cheerio';
import type { ExtractedContent } from '@content-capture/core';
import type { ContentScraper, ScraperOptions } from './types';

/**
 * Sanitize text to remove problematic Unicode characters that break JSON/PostgreSQL
 */
function sanitizeText(text: string): string {
  return text
    .replace(/\0/g, '') // Remove null bytes
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
    .replace(/[\uFFFD\uFFFE\uFFFF]/g, '') // Remove Unicode replacement chars
    .replace(/[\uE000-\uF8FF]/g, '') // Remove private use area
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * PDF content scraper
 * Extracts text and metadata from PDF documents
 * Also handles arXiv abstract pages by fetching the actual PDF
 */
export class PdfScraper implements ContentScraper {
  name = 'pdf';

  canHandle(url: string): boolean {
    const lowerUrl = url.toLowerCase();
    return (
      lowerUrl.endsWith('.pdf') ||
      lowerUrl.includes('/pdf/') ||
      lowerUrl.includes('type=pdf') ||
      lowerUrl.includes('format=pdf') ||
      // Handle arXiv abstract pages - we'll fetch the actual PDF
      /arxiv\.org\/abs\//.test(lowerUrl)
    );
  }

  /**
   * Check if URL is an arXiv abstract page
   */
  private isArxivAbstractUrl(url: string): boolean {
    return /arxiv\.org\/abs\//.test(url);
  }

  /**
   * Convert arXiv abstract URL to PDF URL
   */
  private arxivAbstractToPdfUrl(url: string): string {
    return url.replace('/abs/', '/pdf/') + '.pdf';
  }

  async scrape(url: string, options?: ScraperOptions): Promise<ExtractedContent> {
    // Handle arXiv abstract pages specially
    if (this.isArxivAbstractUrl(url)) {
      return this.scrapeArxiv(url, options);
    }

    console.log(`PDF Scraper: Fetching ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ContentCapture/1.0)',
        Accept: 'application/pdf',
      },
      signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('pdf') && !url.toLowerCase().endsWith('.pdf')) {
      throw new Error(`Not a PDF: content-type is ${contentType}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    console.log(`PDF Scraper: Parsing ${buffer.length} bytes`);

    const pdf = await pdfParse(buffer);

    // Extract title from metadata or filename
    const title = pdf.info?.Title || this.extractTitleFromUrl(url);
    const author = pdf.info?.Author;

    // Store full PDF content - no truncation, sanitized
    const bodyText = sanitizeText(pdf.text);

    // Create a summary from the first part of the text
    const description = bodyText.slice(0, 500) + (bodyText.length > 500 ? '...' : '');

    console.log(
      `PDF Scraper: Extracted ${pdf.numpages} pages, ${bodyText.length} chars`
    );

    return {
      title,
      description,
      bodyText,
      authorName: author,
      images: [],
      videos: [],
      platformData: {
        contentFormat: 'pdf',
        pageCount: pdf.numpages,
        pdfInfo: {
          title: pdf.info?.Title,
          author: pdf.info?.Author,
          subject: pdf.info?.Subject,
          keywords: pdf.info?.Keywords,
          creator: pdf.info?.Creator,
          producer: pdf.info?.Producer,
          creationDate: pdf.info?.CreationDate,
          modificationDate: pdf.info?.ModDate,
        },
      },
    };
  }

  /**
   * Extract a readable title from the PDF URL
   */
  private extractTitleFromUrl(url: string): string {
    try {
      const pathname = new URL(url).pathname;
      const filename = pathname.split('/').pop() || 'Document';

      // Remove .pdf extension and clean up
      return filename
        .replace(/\.pdf$/i, '')
        .replace(/[-_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    } catch {
      return 'PDF Document';
    }
  }

  /**
   * Scrape arXiv abstract pages - fetches metadata from abstract page and full text from PDF
   */
  private async scrapeArxiv(url: string, options?: ScraperOptions): Promise<ExtractedContent> {
    console.log(`PDF Scraper: Processing arXiv page ${url}`);

    let title: string | undefined;
    let authorName: string | undefined;
    let description: string | undefined;

    // First, get metadata from the abstract page
    try {
      const abstractResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined,
      });

      if (abstractResponse.ok) {
        const html = await abstractResponse.text();
        const $ = cheerio.load(html);

        // Extract arXiv-specific metadata
        title =
          $('meta[name="citation_title"]').attr('content') ||
          $('h1.title').text().replace('Title:', '').trim() ||
          undefined;

        // Get authors
        const authors = $('meta[name="citation_author"]')
          .map((_, el) => $(el).attr('content'))
          .get()
          .join(', ');
        if (authors) {
          authorName = authors;
        }

        // Get abstract
        description =
          $('meta[name="citation_abstract"]').attr('content') ||
          $('blockquote.abstract').text().replace('Abstract:', '').trim() ||
          undefined;

        console.log(`PDF Scraper: Got arXiv metadata - "${title?.slice(0, 50)}..." by ${authorName?.slice(0, 50)}`);
      }
    } catch (err) {
      console.warn('PDF Scraper: Failed to fetch arXiv abstract page:', err);
    }

    // Now get the full PDF content
    const pdfUrl = this.arxivAbstractToPdfUrl(url);
    console.log(`PDF Scraper: Downloading arXiv PDF: ${pdfUrl}`);

    const pdfResponse = await fetch(pdfUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ContentCapture/1.0)',
        Accept: 'application/pdf',
      },
      signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined,
    });

    if (!pdfResponse.ok) {
      throw new Error(`Failed to fetch arXiv PDF: HTTP ${pdfResponse.status}`);
    }

    const buffer = Buffer.from(await pdfResponse.arrayBuffer());
    console.log(`PDF Scraper: Parsing arXiv PDF ${buffer.length} bytes`);

    const pdf = await pdfParse(buffer);

    // Use metadata from abstract page if available, fallback to PDF metadata
    const finalTitle = title || pdf.info?.Title || this.extractTitleFromUrl(url);
    const finalAuthor = authorName || pdf.info?.Author;

    // Full text - no truncation, sanitized
    const fullText = sanitizeText(pdf.text);

    // Structure content with abstract first if available
    const bodyText = description
      ? `ABSTRACT:\n${sanitizeText(description)}\n\nFULL PAPER:\n${fullText}`
      : fullText;

    console.log(`PDF Scraper: Extracted arXiv paper - ${pdf.numpages} pages, ${bodyText.length} chars`);

    return {
      title: finalTitle,
      description: description || bodyText.slice(0, 500) + '...',
      bodyText,
      authorName: finalAuthor,
      images: [],
      videos: [],
      platformData: {
        contentFormat: 'pdf',
        arxivUrl: url,
        pdfUrl: pdfUrl,
        pageCount: pdf.numpages,
        pdfInfo: {
          title: pdf.info?.Title,
          author: pdf.info?.Author,
          subject: pdf.info?.Subject,
          keywords: pdf.info?.Keywords,
          creator: pdf.info?.Creator,
          producer: pdf.info?.Producer,
          creationDate: pdf.info?.CreationDate,
          modificationDate: pdf.info?.ModDate,
        },
      },
    };
  }
}
