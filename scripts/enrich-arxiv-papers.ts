/**
 * Re-enrich ArXiv Papers
 *
 * Finds tweets with arxiv links and re-scrapes them to get full PDF content.
 *
 * Usage:
 *   npx tsx scripts/enrich-arxiv-papers.ts
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

interface ScrapedContent {
  url: string;
  title: string | null;
  description: string | null;
  bodyText: string | null;
  contentType: 'pdf';
  scrapedAt: string;
  error?: string;
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

      result.title = $('meta[name="citation_title"]').attr('content')
        || $('h1.title').text().replace('Title:', '').trim()
        || null;

      const authors = $('meta[name="citation_author"]')
        .map((_, el) => $(el).attr('content'))
        .get()
        .join(', ');

      result.description = $('meta[name="citation_abstract"]').attr('content')
        || $('blockquote.abstract').text().replace('Abstract:', '').trim()
        || null;

      console.log(`    Title: ${result.title?.slice(0, 60)}...`);
      console.log(`    Authors: ${authors.slice(0, 60)}...`);
    }

    // Get PDF
    const pdfUrl = url.replace('/abs/', '/pdf/') + '.pdf';
    console.log(`    Downloading PDF...`);

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

    // Structure the content with abstract first
    result.bodyText = result.description
      ? `ABSTRACT:\n${result.description}\n\nFULL PAPER:\n${fullText.slice(0, 25000)}`
      : fullText.slice(0, 25000);

    console.log(`    Extracted ${fullText.length} chars from PDF`);

  } catch (err) {
    result.error = err instanceof Error ? err.message : 'Unknown error';
  }

  return result;
}

interface TwitterItem {
  id: string;
  title: string | null;
  body_text: string | null;
  summary: string | null;
  topics: string[] | null;
  author_name: string | null;
  platform_data: Record<string, unknown> | null;
}

function prepareTextForEmbedding(
  item: TwitterItem,
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
    parts.push(`Content: ${item.body_text.slice(0, 3000)}`);
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

async function main() {
  console.log('='.repeat(60));
  console.log('Re-enrich ArXiv Papers with Full PDF Content');
  console.log('='.repeat(60));
  if (DRY_RUN) console.log('DRY RUN - no changes will be made\n');

  // Find tweets with arxiv links
  const { data: items, error } = await supabase
    .from('content_items')
    .select('id, title, body_text, summary, topics, author_name, platform_data')
    .eq('source_type', 'twitter')
    .not('platform_data->linked_content', 'is', null);

  if (error) {
    console.error('Error fetching items:', error);
    return;
  }

  // Filter to items with arxiv links
  const arxivItems = items?.filter(item => {
    const links = (item.platform_data?.linked_content as Array<{ url: string }>) || [];
    return links.some(l => l.url?.includes('arxiv.org/abs/'));
  }) || [];

  console.log(`Found ${arxivItems.length} tweets with arxiv links\n`);

  if (arxivItems.length === 0) {
    console.log('No arxiv papers to process');
    return;
  }

  let processed = 0;
  let updated = 0;

  for (const item of arxivItems) {
    processed++;
    console.log(`\n[${processed}/${arxivItems.length}] ${item.title?.slice(0, 50) || 'Untitled'}...`);

    const links = (item.platform_data?.linked_content as Array<{ url: string; bodyText?: string }>) || [];
    const arxivLinks = links.filter(l => l.url?.includes('arxiv.org/abs/'));

    // Re-scrape each arxiv link
    const updatedLinks = [...links];

    for (const link of arxivLinks) {
      console.log(`  Processing: ${link.url}`);

      // Check if already has substantial content
      if (link.bodyText && link.bodyText.length > 5000) {
        console.log(`    Already has ${link.bodyText.length} chars, skipping`);
        continue;
      }

      const scraped = await scrapeArxiv(link.url);

      // Update the link in the array
      const linkIndex = updatedLinks.findIndex(l => l.url === link.url);
      if (linkIndex !== -1) {
        updatedLinks[linkIndex] = {
          ...updatedLinks[linkIndex],
          title: scraped.title || updatedLinks[linkIndex].title,
          description: scraped.description,
          bodyText: scraped.bodyText,
          contentType: scraped.contentType,
          scrapedAt: scraped.scrapedAt,
          error: scraped.error,
        };
      }

      await sleep(1000); // Rate limit
    }

    if (DRY_RUN) continue;

    // Generate new embedding with full content
    const embeddingText = prepareTextForEmbedding(item, updatedLinks as ScrapedContent[]);
    const embedding = await generateEmbedding(embeddingText);

    // Update the record
    const updateData: Record<string, unknown> = {
      platform_data: {
        ...item.platform_data,
        linked_content: updatedLinks,
        arxiv_enriched_at: new Date().toISOString(),
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
      console.log(`    Updated record with full PDF content`);
      updated++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('ArXiv Enrichment Complete');
  console.log('='.repeat(60));
  console.log(`Processed: ${processed}`);
  console.log(`Updated: ${updated}`);
}

main().catch(console.error);
