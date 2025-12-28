import pdfParse from 'pdf-parse';
import type { ExtractedContent } from '@content-capture/core';
import type { ContentScraper, ScraperOptions } from './types';

/**
 * PDF content scraper
 * Extracts text and metadata from PDF documents
 */
export class PdfScraper implements ContentScraper {
  name = 'pdf';

  canHandle(url: string): boolean {
    const lowerUrl = url.toLowerCase();
    return (
      lowerUrl.endsWith('.pdf') ||
      lowerUrl.includes('/pdf/') ||
      lowerUrl.includes('type=pdf') ||
      lowerUrl.includes('format=pdf')
    );
  }

  async scrape(url: string, options?: ScraperOptions): Promise<ExtractedContent> {
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

    // Limit text to prevent token overflow (keep first ~50k chars)
    const bodyText = pdf.text.replace(/\s+/g, ' ').trim().slice(0, 50000);

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
}
