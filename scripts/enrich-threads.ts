/**
 * Enrich Tweets with Thread Data
 *
 * Uses multiple approaches to get thread content:
 * 1. ThreadReaderApp (for threads that have been unrolled)
 * 2. FxTwitter conversation (following reply chain up)
 * 3. Extract links from thread text and scrape them
 *
 * Stores everything in the main tweet's platform_data.
 *
 * Usage:
 *   npx tsx scripts/enrich-threads.ts
 *   DRY_RUN=true npx tsx scripts/enrich-threads.ts
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

const DRY_RUN = process.env.DRY_RUN === 'true';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// URL extraction
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
const SKIP_DOMAINS = [
  'twitter.com',
  'x.com',
  't.co',
  'pic.twitter.com',
  'pbs.twimg.com',
  'threadreaderapp.com',
  'whatismybrowser.com',
];
const SKIP_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov'];

function extractLinksFromText(text: string): string[] {
  const matches = text.match(URL_REGEX) || [];
  return matches.filter(url => {
    const lowerUrl = url.toLowerCase();
    if (SKIP_DOMAINS.some(d => lowerUrl.includes(d))) return false;
    if (SKIP_EXTENSIONS.some(ext => lowerUrl.endsWith(ext))) return false;
    return true;
  });
}

function isArxivUrl(url: string): boolean {
  return url.includes('arxiv.org/abs/') || url.includes('arxiv.org/pdf/');
}

function normalizeArxivUrl(url: string): string {
  if (url.includes('/pdf/')) {
    return url.replace('/pdf/', '/abs/').replace('.pdf', '');
  }
  return url;
}

// ThreadReaderApp scraping
interface ThreadData {
  tweetCount: number;
  texts: string[];
  links: string[];
  fullText: string;
  source: 'threadreader' | 'fxtwitter' | 'combined';
}

async function fetchThreadFromThreadReader(tweetId: string): Promise<ThreadData | null> {
  const url = `https://threadreaderapp.com/thread/${tweetId}.html`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Check if this is actually an unrolled thread
    const contentTweets = $('.content-tweet');
    if (contentTweets.length === 0) {
      // Not unrolled yet
      return null;
    }

    const texts: string[] = [];
    const allLinks: string[] = [];

    contentTweets.each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 5) {
        texts.push(text);
        const links = extractLinksFromText(text);
        allLinks.push(...links);
      }
    });

    // Also extract links from anchor tags within tweets
    contentTweets.find('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && href.startsWith('http')) {
        if (!SKIP_DOMAINS.some(d => href.includes(d)) && !SKIP_EXTENSIONS.some(ext => href.toLowerCase().endsWith(ext))) {
          allLinks.push(href);
        }
      }
    });

    const uniqueLinks = [...new Set(allLinks)];

    return {
      tweetCount: texts.length,
      texts,
      links: uniqueLinks,
      fullText: texts.join('\n\n---\n\n'),
      source: 'threadreader',
    };
  } catch (err) {
    return null;
  }
}

// FxTwitter API for getting thread context
interface FxTweet {
  id: string;
  text: string;
  author: { screen_name: string };
  replying_to?: string;
  replying_to_status?: string;
}

async function fetchTweetFromFx(handle: string, tweetId: string): Promise<FxTweet | null> {
  try {
    const url = `https://api.fxtwitter.com/${handle}/status/${tweetId}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.code !== 200) return null;

    return {
      id: data.tweet.id,
      text: data.tweet.text,
      author: data.tweet.author,
      replying_to: data.tweet.replying_to,
      replying_to_status: data.tweet.replying_to_status,
    };
  } catch {
    return null;
  }
}

async function walkThreadUp(handle: string, tweetId: string, authorHandle: string, maxDepth = 10): Promise<FxTweet[]> {
  const thread: FxTweet[] = [];
  let currentId = tweetId;
  let currentHandle = handle;
  let depth = 0;

  while (depth < maxDepth) {
    const tweet = await fetchTweetFromFx(currentHandle, currentId);
    if (!tweet) break;

    // Only include tweets from the same author (thread continuation)
    if (tweet.author.screen_name.toLowerCase() === authorHandle.toLowerCase()) {
      thread.unshift(tweet); // Add to beginning
    }

    // Check if this is a reply to another tweet by same author
    if (tweet.replying_to_status && tweet.replying_to?.toLowerCase() === authorHandle.toLowerCase()) {
      currentId = tweet.replying_to_status;
      currentHandle = tweet.replying_to;
      depth++;
      await sleep(300);
    } else {
      break;
    }
  }

  return thread;
}

async function getThreadData(tweetId: string, authorHandle: string): Promise<ThreadData | null> {
  // First try ThreadReaderApp (best for fully unrolled threads)
  const threadReaderData = await fetchThreadFromThreadReader(tweetId);
  if (threadReaderData && threadReaderData.tweetCount > 1) {
    return threadReaderData;
  }

  // Fall back to walking up the reply chain via FxTwitter
  const cleanHandle = authorHandle.replace('@', '');
  const fxThread = await walkThreadUp(cleanHandle, tweetId, cleanHandle);

  if (fxThread.length > 1) {
    const texts = fxThread.map(t => t.text);
    const allLinks: string[] = [];
    for (const t of fxThread) {
      allLinks.push(...extractLinksFromText(t.text));
    }

    return {
      tweetCount: fxThread.length,
      texts,
      links: [...new Set(allLinks)],
      fullText: texts.join('\n\n---\n\n'),
      source: 'fxtwitter',
    };
  }

  // If we got ThreadReaderApp data with just 1 tweet, use it for links
  if (threadReaderData) {
    return threadReaderData;
  }

  return null;
}

// Content scraping
interface ScrapedContent {
  url: string;
  title: string | null;
  description: string | null;
  bodyText: string | null;
  contentType: string;
  scrapedAt: string;
  error?: string;
}

async function scrapeArxiv(url: string): Promise<ScrapedContent> {
  const normalizedUrl = normalizeArxivUrl(url);
  const result: ScrapedContent = {
    url: normalizedUrl,
    title: null,
    description: null,
    bodyText: null,
    contentType: 'pdf',
    scrapedAt: new Date().toISOString(),
  };

  try {
    const abstractResponse = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (abstractResponse.ok) {
      const html = await abstractResponse.text();
      const $ = cheerio.load(html);

      result.title = $('meta[name="citation_title"]').attr('content')
        || $('h1.title').text().replace('Title:', '').trim()
        || null;

      result.description = $('meta[name="citation_abstract"]').attr('content')
        || $('blockquote.abstract').text().replace('Abstract:', '').trim()
        || null;
    }

    const pdfUrl = normalizedUrl.replace('/abs/', '/pdf/') + '.pdf';
    console.log(`      Downloading PDF...`);

    const pdfParse = (await import('pdf-parse')).default;
    const pdfResponse = await fetch(pdfUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentCapture/1.0)' },
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

    const fullText = data.text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();

    result.bodyText = result.description
      ? `ABSTRACT:\n${result.description}\n\nFULL PAPER:\n${fullText.slice(0, 25000)}`
      : fullText.slice(0, 25000);

    console.log(`      Extracted ${fullText.length} chars from PDF`);
  } catch (err) {
    result.error = err instanceof Error ? err.message : 'Unknown error';
    console.log(`      Error: ${result.error}`);
  }

  return result;
}

async function scrapeGenericUrl(url: string): Promise<ScrapedContent> {
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
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    });

    if (!response.ok) {
      result.error = `HTTP ${response.status}`;
      return result;
    }

    const contentType = response.headers.get('content-type') || '';
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

    result.title = $('meta[property="og:title"]').attr('content')
      || $('title').text().trim()
      || null;

    result.description = $('meta[property="og:description"]').attr('content')
      || $('meta[name="description"]').attr('content')
      || null;

    $('script, style, nav, header, footer, aside, .ads, .comments').remove();
    const articleContent = $('article, main, .post-content, .entry-content, .content').text()
      || $('body').text();

    result.bodyText = articleContent
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 10000);

    console.log(`      Scraped ${result.bodyText?.length || 0} chars`);
  } catch (err) {
    result.error = err instanceof Error ? err.message : 'Unknown error';
    console.log(`      Error: ${result.error}`);
  }

  return result;
}

async function scrapeUrl(url: string): Promise<ScrapedContent> {
  if (isArxivUrl(url)) {
    return scrapeArxiv(url);
  }
  return scrapeGenericUrl(url);
}

// Embedding generation
interface ContentItem {
  id: string;
  source_url: string;
  title: string | null;
  body_text: string | null;
  summary: string | null;
  topics: string[] | null;
  author_name: string | null;
  author_handle: string | null;
  platform_data: Record<string, unknown> | null;
}

function prepareTextForEmbedding(
  item: ContentItem,
  threadData: ThreadData | null,
  linkedContent: ScrapedContent[]
): string {
  const parts: string[] = [];

  if (item.title) {
    parts.push(`Tweet: ${item.title}`);
  }
  if (item.author_name) {
    parts.push(`Author: ${item.author_name}`);
  }
  if (item.body_text) {
    parts.push(`Content: ${item.body_text.slice(0, 2000)}`);
  }

  if (threadData && threadData.tweetCount > 1) {
    parts.push(`Thread (${threadData.tweetCount} tweets):\n${threadData.fullText.slice(0, 3000)}`);
  }

  if (item.summary) {
    parts.push(`Summary: ${item.summary}`);
  }
  if (item.topics && item.topics.length > 0) {
    parts.push(`Topics: ${item.topics.join(', ')}`);
  }

  for (const link of linkedContent) {
    if (link.error) continue;
    parts.push(`\n--- Linked: ${link.url} ---`);
    if (link.title) {
      parts.push(`Link Title: ${link.title}`);
    }
    if (link.description) {
      parts.push(`Link Description: ${link.description}`);
    }
    if (link.bodyText) {
      parts.push(`Link Content: ${link.bodyText.slice(0, 5000)}`);
    }
  }

  return parts.join('\n\n');
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

// Main processing
async function main() {
  console.log('='.repeat(60));
  console.log('Enrich Tweets with Thread Data');
  console.log('='.repeat(60));
  if (DRY_RUN) console.log('DRY RUN - no changes will be made\n');

  const { data: items, error } = await supabase
    .from('content_items')
    .select('id, source_url, title, body_text, summary, topics, author_name, author_handle, platform_data')
    .eq('source_type', 'twitter');

  if (error) {
    console.error('Error fetching items:', error);
    return;
  }

  console.log(`Found ${items?.length || 0} tweets to process\n`);

  let processed = 0;
  let threadsFound = 0;
  let linksScraped = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of items || []) {
    processed++;

    const tweetIdMatch = item.source_url?.match(/status\/(\d+)/);
    if (!tweetIdMatch) {
      console.log(`[${processed}/${items.length}] Skipping - no tweet ID: ${item.source_url}`);
      skipped++;
      continue;
    }

    const tweetId = tweetIdMatch[1];
    const authorHandle = item.author_handle || item.platform_data?.authorHandle as string || '';

    if (!authorHandle) {
      console.log(`[${processed}/${items.length}] Skipping - no author handle: ${item.title?.slice(0, 40)}...`);
      skipped++;
      continue;
    }

    const existingThread = item.platform_data?.thread as ThreadData | undefined;
    const existingLinks = (item.platform_data?.linked_content as ScrapedContent[]) || [];

    // Skip if already fully processed
    if (existingThread && existingThread.tweetCount > 1 && item.platform_data?.thread_enriched_at) {
      console.log(`[${processed}/${items.length}] Already enriched: ${item.title?.slice(0, 40)}...`);
      skipped++;
      continue;
    }

    console.log(`\n[${processed}/${items.length}] ${item.title?.slice(0, 50) || 'Untitled'}...`);
    console.log(`    Author: ${authorHandle}, Tweet ID: ${tweetId}`);

    // Fetch thread data
    const threadData = await getThreadData(tweetId, authorHandle);

    if (threadData) {
      console.log(`    Found thread: ${threadData.tweetCount} tweets, ${threadData.links.length} links (via ${threadData.source})`);
      if (threadData.tweetCount > 1) {
        threadsFound++;
      }
    } else {
      console.log('    No thread data found');
    }

    // Combine links from tweet body and thread
    const tweetBodyLinks = extractLinksFromText(item.body_text || '');
    const allFoundLinks = [...new Set([...tweetBodyLinks, ...(threadData?.links || [])])];
    console.log(`    Total unique links found: ${allFoundLinks.length}`);

    // Find new links to scrape
    const existingUrls = new Set(existingLinks.map(l => l.url));
    const newLinks = allFoundLinks.filter(url => !existingUrls.has(url));

    console.log(`    New links to scrape: ${newLinks.length}`);

    // Scrape new links
    const newScrapedContent: ScrapedContent[] = [];
    for (const url of newLinks.slice(0, 5)) {
      console.log(`    Scraping: ${url.slice(0, 60)}...`);
      const scraped = await scrapeUrl(url);
      newScrapedContent.push(scraped);
      linksScraped++;
      await sleep(500);
    }

    const allLinkedContent = [...existingLinks, ...newScrapedContent];

    // Skip update if nothing new
    if (!threadData && newScrapedContent.length === 0 && existingThread) {
      console.log('    No new data to add');
      continue;
    }

    if (DRY_RUN) {
      console.log('    [DRY RUN] Would update record');
      continue;
    }

    // Generate new embedding
    const embeddingText = prepareTextForEmbedding(item, threadData, allLinkedContent);
    const embedding = await generateEmbedding(embeddingText);

    // Update record
    const updateData: Record<string, unknown> = {
      platform_data: {
        ...item.platform_data,
        thread: threadData,
        threadLength: threadData?.tweetCount || 1,
        linked_content: allLinkedContent,
        thread_enriched_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    };

    if (embedding) {
      updateData.embedding = `[${embedding.join(',')}]`;
      updateData.embedding_generated_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from('content_items')
      .update(updateData)
      .eq('id', item.id);

    if (updateError) {
      console.error(`    Error updating: ${updateError.message}`);
    } else {
      console.log(`    Updated with thread and ${allLinkedContent.length} links`);
      updated++;
    }

    await sleep(1000);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Thread Enrichment Complete');
  console.log('='.repeat(60));
  console.log(`Processed: ${processed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Threads found: ${threadsFound}`);
  console.log(`Links scraped: ${linksScraped}`);
  console.log(`Records updated: ${updated}`);
}

main().catch(console.error);
