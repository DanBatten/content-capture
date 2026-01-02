/**
 * Enrich Tweets with Linked Content
 *
 * For each tweet:
 * 1. Extracts URLs from tweet text
 * 2. Scrapes article content or parses PDF content
 * 3. Stores the content IN the tweet record (platform_data.linked_content)
 * 4. Regenerates embedding with combined content (tweet + thread + links)
 *
 * Usage:
 *   npx tsx scripts/enrich-tweets-with-links.ts
 *
 * Options (via env vars):
 *   BATCH_SIZE - Items per batch (default: 10)
 *   DELAY_MS - Milliseconds between requests (default: 1000)
 *   DRY_RUN - Set to "true" to preview without making changes
 *   SKIP_PROCESSED - Set to "false" to reprocess items with existing linked_content
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../apps/web/.env.local') });

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10');
const DELAY_MS = parseInt(process.env.DELAY_MS || '1000');
const DRY_RUN = process.env.DRY_RUN === 'true';
const SKIP_PROCESSED = process.env.SKIP_PROCESSED !== 'false';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// ============ URL Extraction ============

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
const SKIP_DOMAINS = [
  'twitter.com', 'x.com', 't.co', 'pic.twitter.com', 'pbs.twimg.com',
  'abs.twimg.com', 'video.twimg.com', 'instagram.com', 'facebook.com',
  'fb.com', 'linkedin.com', 'pinterest.com', 'pin.it', 'tiktok.com',
  'youtube.com', 'youtu.be', 'vimeo.com',
];
const SKIP_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.mp4', '.webm', '.mov'];

function extractLinksFromText(text: string): string[] {
  const matches = text.match(URL_REGEX) || [];
  return matches
    .map(url => url.replace(/[.,;:!?)\]}>]+$/, ''))
    .filter(url => {
      const lowerUrl = url.toLowerCase();
      if (SKIP_DOMAINS.some(domain => lowerUrl.includes(domain))) return false;
      if (SKIP_EXTENSIONS.some(ext => lowerUrl.endsWith(ext))) return false;
      return true;
    })
    .filter((url, index, self) => self.indexOf(url) === index);
}

function isPdfUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return lowerUrl.endsWith('.pdf') || lowerUrl.includes('.pdf?') || lowerUrl.includes('type=pdf');
}

function isArxivAbstractUrl(url: string): boolean {
  return /arxiv\.org\/abs\//.test(url);
}

function arxivAbstractToPdfUrl(url: string): string {
  // Convert https://arxiv.org/abs/2512.18552 to https://arxiv.org/pdf/2512.18552.pdf
  return url.replace('/abs/', '/pdf/') + '.pdf';
}

// ============ URL Expansion ============

async function expandShortUrl(url: string): Promise<string> {
  if (!url.includes('t.co')) return url;
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentCapture/1.0)' },
    });
    return response.headers.get('location') || url;
  } catch {
    return url;
  }
}

// ============ Content Scraping ============

interface ScrapedContent {
  url: string;
  title: string | null;
  description: string | null;
  bodyText: string | null;
  contentType: 'article' | 'pdf' | 'unknown';
  scrapedAt: string;
  error?: string;
}

async function scrapeArticle(url: string): Promise<ScrapedContent> {
  const result: ScrapedContent = {
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
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      result.error = `HTTP ${response.status}`;
      return result;
    }

    const contentType = response.headers.get('content-type') || '';

    // Check if it's actually a PDF
    if (contentType.includes('application/pdf')) {
      return await scrapePdf(url);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Remove script and style elements
    $('script, style, nav, header, footer, aside, .ads, .comments').remove();

    // Extract title
    result.title = $('meta[property="og:title"]').attr('content')
      || $('meta[name="twitter:title"]').attr('content')
      || $('title').text()
      || $('h1').first().text()
      || null;

    // Extract description
    result.description = $('meta[property="og:description"]').attr('content')
      || $('meta[name="description"]').attr('content')
      || $('meta[name="twitter:description"]').attr('content')
      || null;

    // Extract body text - try article content first
    let bodyText = '';

    const articleSelectors = [
      'article',
      '[role="main"]',
      '.post-content',
      '.article-content',
      '.entry-content',
      '.content',
      'main',
    ];

    for (const selector of articleSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        bodyText = element.text();
        break;
      }
    }

    // Fallback to body if no article found
    if (!bodyText) {
      bodyText = $('body').text();
    }

    // Clean up text - no truncation, store full content
    result.bodyText = bodyText
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();

    if (result.title) {
      result.title = result.title.trim();
    }
    if (result.description) {
      result.description = result.description.trim();
    }

  } catch (err) {
    result.error = err instanceof Error ? err.message : 'Unknown error';
  }

  return result;
}

async function scrapePdf(url: string): Promise<ScrapedContent> {
  const result: ScrapedContent = {
    url,
    title: null,
    description: null,
    bodyText: null,
    contentType: 'pdf',
    scrapedAt: new Date().toISOString(),
  };

  try {
    // Dynamic import pdf-parse
    const pdfParse = (await import('pdf-parse')).default;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ContentCapture/1.0)',
      },
    });

    if (!response.ok) {
      result.error = `HTTP ${response.status}`;
      return result;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const data = await pdfParse(buffer);

    result.title = data.info?.Title || url.split('/').pop()?.replace('.pdf', '') || null;
    // No truncation - store full PDF content
    result.bodyText = data.text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();

  } catch (err) {
    result.error = err instanceof Error ? err.message : 'Unknown error';
  }

  return result;
}

async function scrapeArxiv(url: string): Promise<ScrapedContent> {
  const result: ScrapedContent = {
    url,
    title: null,
    description: null,
    bodyText: null,
    contentType: 'pdf',
    scrapedAt: new Date().toISOString(),
  };

  try {
    // First, get metadata from the abstract page
    const abstractResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (abstractResponse.ok) {
      const html = await abstractResponse.text();
      const $ = cheerio.load(html);

      // Extract arxiv-specific metadata
      result.title = $('meta[name="citation_title"]').attr('content')
        || $('h1.title').text().replace('Title:', '').trim()
        || null;

      // Get authors
      const authors = $('meta[name="citation_author"]')
        .map((_, el) => $(el).attr('content'))
        .get()
        .join(', ');

      // Get abstract
      const abstract = $('meta[name="citation_abstract"]').attr('content')
        || $('blockquote.abstract').text().replace('Abstract:', '').trim()
        || null;

      result.description = abstract;

      console.log(`      [ArXiv] Got metadata: "${result.title?.slice(0, 50)}..." by ${authors.slice(0, 50)}`);
    }

    // Now get the full PDF content
    const pdfUrl = arxivAbstractToPdfUrl(url);
    console.log(`      [ArXiv] Downloading PDF: ${pdfUrl}`);

    const pdfParse = (await import('pdf-parse')).default;

    const pdfResponse = await fetch(pdfUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ContentCapture/1.0)',
      },
    });

    if (!pdfResponse.ok) {
      result.error = `PDF HTTP ${pdfResponse.status}`;
      // Still return with metadata if we have it
      if (result.description) {
        result.bodyText = `Abstract: ${result.description}`;
      }
      return result;
    }

    const buffer = Buffer.from(await pdfResponse.arrayBuffer());
    const data = await pdfParse(buffer);

    // Combine abstract with full text - no truncation, store everything
    const fullText = data.text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();

    // Structure the content with abstract first, then full paper
    result.bodyText = result.description
      ? `ABSTRACT:\n${result.description}\n\nFULL PAPER:\n${fullText}`
      : fullText;

    console.log(`      [ArXiv] Extracted ${fullText.length} chars from PDF`);

  } catch (err) {
    result.error = err instanceof Error ? err.message : 'Unknown error';
  }

  return result;
}

async function scrapeUrl(url: string): Promise<ScrapedContent> {
  // Handle arxiv abstract pages specially - fetch the actual PDF
  if (isArxivAbstractUrl(url)) {
    return await scrapeArxiv(url);
  }
  if (isPdfUrl(url)) {
    return await scrapePdf(url);
  }
  return await scrapeArticle(url);
}

// ============ Helpers ============

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Sanitize text to remove problematic Unicode characters that break JSON/PostgreSQL
 * Removes control characters, null bytes, and invalid escape sequences
 */
function sanitizeText(text: string): string {
  return text
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove other control characters (except newline, tab, carriage return)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Remove Unicode replacement character and other problematic chars
    .replace(/[\uFFFD\uFFFE\uFFFF]/g, '')
    // Remove private use area characters
    .replace(/[\uE000-\uF8FF]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

// ============ Database Types ============

interface TwitterItem {
  id: string;
  source_url: string;
  body_text: string | null;
  title: string | null;
  summary: string | null;
  topics: string[] | null;
  author_name: string | null;
  author_handle: string | null;
  platform_data: Record<string, unknown> | null;
}

// ============ Main Processing ============

async function getTwitterItems(): Promise<TwitterItem[]> {
  const { data, error } = await supabase
    .from('content_items')
    .select('id, source_url, body_text, title, summary, topics, author_name, author_handle, platform_data')
    .eq('source_type', 'twitter')
    .eq('status', 'complete')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch items: ${error.message}`);
  return data || [];
}

function prepareTextForEmbedding(
  item: TwitterItem,
  linkedContent: ScrapedContent[]
): string {
  const parts: string[] = [];

  // Tweet title/author
  if (item.title) {
    parts.push(`Tweet: ${item.title}`);
  }
  if (item.author_name) {
    parts.push(`Author: ${item.author_name}`);
  }

  // Tweet body (or thread content)
  if (item.body_text) {
    parts.push(`Content: ${item.body_text.slice(0, 3000)}`);
  }

  // Summary and topics
  if (item.summary) {
    parts.push(`Summary: ${item.summary}`);
  }
  if (item.topics && item.topics.length > 0) {
    parts.push(`Topics: ${item.topics.join(', ')}`);
  }

  // Linked content - this is the key enrichment!
  for (const link of linkedContent) {
    if (link.error) continue;

    parts.push(`\n--- Linked: ${link.url} ---`);
    if (link.title) {
      parts.push(`Link Title: ${sanitizeText(link.title)}`);
    }
    if (link.description) {
      parts.push(`Link Description: ${sanitizeText(link.description)}`);
    }
    if (link.bodyText) {
      // Limit each link's body text and sanitize
      parts.push(`Link Content: ${sanitizeText(link.bodyText.slice(0, 3000))}`);
    }
  }

  return sanitizeText(parts.join('\n\n'));
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const maxChars = 8191 * 4;
    const truncatedText = text.slice(0, maxChars);

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: truncatedText,
      dimensions: 1536,
    });

    return response.data[0]?.embedding || null;
  } catch (err) {
    console.error('Embedding error:', err);
    return null;
  }
}

async function updateItemWithLinkedContent(
  itemId: string,
  linkedContent: ScrapedContent[],
  existingPlatformData: Record<string, unknown> | null,
  embeddingText: string
): Promise<boolean> {
  // Generate new embedding with enriched content
  const embedding = await generateEmbedding(embeddingText);

  // Update platform_data with linked content (sanitize text to avoid Unicode issues)
  // Store full content - no truncation. Storage is cheap, data is valuable.
  const updatedPlatformData = {
    ...existingPlatformData,
    linked_content: linkedContent.map(lc => ({
      url: lc.url,
      title: lc.title ? sanitizeText(lc.title) : null,
      description: lc.description ? sanitizeText(lc.description) : null,
      bodyText: lc.bodyText ? sanitizeText(lc.bodyText) : null,
      contentType: lc.contentType,
      scrapedAt: lc.scrapedAt,
      error: lc.error,
    })),
    links_processed_at: new Date().toISOString(),
  };

  const updateData: Record<string, unknown> = {
    platform_data: updatedPlatformData,
    updated_at: new Date().toISOString(),
  };

  if (embedding) {
    updateData.embedding = `[${embedding.join(',')}]`;
    updateData.embedding_generated_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('content_items')
    .update(updateData)
    .eq('id', itemId);

  if (error) {
    console.error(`Failed to update item ${itemId}:`, error.message);
    return false;
  }

  return true;
}

async function processItem(item: TwitterItem): Promise<{
  linksFound: number;
  linksScraped: number;
  errors: number;
}> {
  const stats = { linksFound: 0, linksScraped: 0, errors: 0 };

  // Get text to search for links
  let textToSearch = item.body_text || '';

  // If thread data exists, include all thread text
  if (item.platform_data?.thread && Array.isArray(item.platform_data.thread)) {
    const threadTexts = (item.platform_data.thread as Array<{ text: string }>)
      .map(t => t.text)
      .join(' ');
    textToSearch = threadTexts;
  }

  // Extract links
  const rawLinks = extractLinksFromText(textToSearch);
  stats.linksFound = rawLinks.length;

  if (rawLinks.length === 0) {
    return stats;
  }

  // Expand and scrape each link
  const linkedContent: ScrapedContent[] = [];

  for (const rawLink of rawLinks) {
    const expandedUrl = await expandShortUrl(rawLink);
    console.log(`      Scraping: ${expandedUrl.slice(0, 60)}...`);

    const content = await scrapeUrl(expandedUrl);
    linkedContent.push(content);

    if (content.error) {
      stats.errors++;
      console.log(`        Error: ${content.error}`);
    } else {
      stats.linksScraped++;
      console.log(`        OK: ${content.title?.slice(0, 50) || 'No title'}`);
    }

    await sleep(DELAY_MS);
  }

  // Update the item with linked content
  if (!DRY_RUN && linkedContent.length > 0) {
    const embeddingText = prepareTextForEmbedding(item, linkedContent);
    const success = await updateItemWithLinkedContent(
      item.id,
      linkedContent,
      item.platform_data,
      embeddingText
    );
    if (success) {
      console.log(`      Updated record with ${linkedContent.length} links`);
    }
  }

  return stats;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Enrich Tweets with Linked Content');
  console.log('='.repeat(60));
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Delay between requests: ${DELAY_MS}ms`);
  console.log(`Skip already processed: ${SKIP_PROCESSED}`);
  if (DRY_RUN) {
    console.log('DRY RUN - no changes will be made');
  }
  console.log('');

  // Get all twitter items
  const allItems = await getTwitterItems();
  console.log(`Found ${allItems.length} Twitter items`);

  // Filter to items that need processing
  const items = SKIP_PROCESSED
    ? allItems.filter(item => !item.platform_data?.linked_content)
    : allItems;

  console.log(`Items to process: ${items.length}`);

  if (items.length === 0) {
    console.log('No items to process!');
    return;
  }

  // Count items with links
  let itemsWithLinks = 0;
  for (const item of items.slice(0, 50)) { // Sample first 50
    const text = item.body_text || '';
    const links = extractLinksFromText(text);
    if (links.length > 0) itemsWithLinks++;
  }
  console.log(`Sample: ~${Math.round(itemsWithLinks / 50 * 100)}% of items have external links`);

  if (!DRY_RUN) {
    console.log('\nStarting in 5 seconds... (Ctrl+C to cancel)');
    await sleep(5000);
  }

  // Process items
  let processed = 0;
  let totalLinksFound = 0;
  let totalLinksScraped = 0;
  let totalErrors = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const shortTitle = (item.title || item.body_text || item.source_url).slice(0, 50);
    console.log(`\n[${i + 1}/${items.length}] ${shortTitle}...`);

    const stats = await processItem(item);

    totalLinksFound += stats.linksFound;
    totalLinksScraped += stats.linksScraped;
    totalErrors += stats.errors;
    processed++;

    if (stats.linksFound === 0) {
      console.log(`    No external links found`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Enrichment Complete');
  console.log('='.repeat(60));
  console.log(`Items processed: ${processed}`);
  console.log(`Total links found: ${totalLinksFound}`);
  console.log(`Links successfully scraped: ${totalLinksScraped}`);
  console.log(`Scraping errors: ${totalErrors}`);
}

main().catch(console.error);
