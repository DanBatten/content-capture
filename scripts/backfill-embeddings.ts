/**
 * Backfill Embeddings Script
 *
 * Generates vector embeddings for all content items that don't have them yet.
 *
 * Usage:
 *   npx tsx scripts/backfill-embeddings.ts
 *
 * Options (via env vars):
 *   BATCH_SIZE - How many to process at once (default: 10)
 *   DELAY_MS - Milliseconds between items to avoid rate limits (default: 100)
 *   DRY_RUN - Set to "true" to preview without making changes
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../apps/web/.env.local') });

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10');
const DELAY_MS = parseInt(process.env.DELAY_MS || '100');
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

interface ContentItem {
  id: string;
  title: string | null;
  description: string | null;
  body_text: string | null;
  summary: string | null;
  topics: string[] | null;
  author_name: string | null;
  source_url: string;
}

/**
 * Prepare text for embedding - combines relevant fields
 */
function prepareTextForEmbedding(item: ContentItem): string {
  const parts: string[] = [];

  if (item.title) {
    parts.push(`Title: ${item.title}`);
  }

  if (item.summary) {
    parts.push(`Summary: ${item.summary}`);
  }

  if (item.description && item.description !== item.summary) {
    parts.push(`Description: ${item.description}`);
  }

  if (item.author_name) {
    parts.push(`Author: ${item.author_name}`);
  }

  if (item.topics && item.topics.length > 0) {
    parts.push(`Topics: ${item.topics.join(', ')}`);
  }

  if (item.body_text) {
    // Limit body text to leave room for other fields
    const bodyLimit = 10000;
    const truncatedBody = item.body_text.slice(0, bodyLimit);
    parts.push(`Content: ${truncatedBody}`);
  }

  return parts.join('\n\n');
}

async function getItemsWithoutEmbeddings(): Promise<ContentItem[]> {
  const { data, error } = await supabase
    .from('content_items')
    .select('id, title, description, body_text, summary, topics, author_name, source_url')
    .eq('status', 'complete')
    .is('embedding', null)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch items: ${error.message}`);
  }

  return data || [];
}

async function generateEmbedding(text: string): Promise<number[]> {
  // Truncate to approximate token limit (4 chars per token rough estimate)
  const maxChars = 8191 * 4;
  const truncatedText = text.slice(0, maxChars);

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: truncatedText,
    dimensions: 1536,
  });

  const embedding = response.data[0]?.embedding;
  if (!embedding) {
    throw new Error('No embedding returned from OpenAI');
  }
  return embedding;
}

async function updateEmbedding(id: string, embedding: number[]): Promise<boolean> {
  const { error } = await supabase
    .from('content_items')
    .update({
      embedding: `[${embedding.join(',')}]`,
      embedding_generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error(`Failed to update embedding for ${id}:`, error.message);
    return false;
  }
  return true;
}

async function main() {
  console.log('='.repeat(50));
  console.log('Backfill Embeddings');
  console.log('='.repeat(50));
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Delay between items: ${DELAY_MS}ms`);
  if (DRY_RUN) {
    console.log('DRY RUN - no changes will be made');
  }
  console.log('');

  const items = await getItemsWithoutEmbeddings();

  if (items.length === 0) {
    console.log('All items already have embeddings!');
    return;
  }

  console.log(`Found ${items.length} items without embeddings`);

  // Estimate cost (roughly $0.02 per 1M tokens for text-embedding-3-small)
  const avgCharsPerItem = items.reduce((sum, item) => {
    return sum + prepareTextForEmbedding(item).length;
  }, 0) / items.length;
  const estimatedTokens = (avgCharsPerItem / 4) * items.length;
  const estimatedCost = (estimatedTokens / 1000000) * 0.02;

  console.log(`Average text length: ${Math.round(avgCharsPerItem)} chars`);
  console.log(`Estimated tokens: ${Math.round(estimatedTokens).toLocaleString()}`);
  console.log(`Estimated cost: $${estimatedCost.toFixed(4)}`);
  console.log('');

  if (DRY_RUN) {
    console.log('DRY RUN - exiting without processing');
    return;
  }

  console.log('Starting in 5 seconds... (Ctrl+C to cancel)');
  await sleep(5000);

  let processed = 0;
  let errors = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(items.length / BATCH_SIZE);

    console.log(`\n[Batch ${batchNum}/${totalBatches}] Processing ${batch.length} items...`);

    for (const item of batch) {
      try {
        const text = prepareTextForEmbedding(item);

        if (text.length < 10) {
          console.log(`  - Skipping ${item.id}: not enough content`);
          continue;
        }

        const embedding = await generateEmbedding(text);
        const updated = await updateEmbedding(item.id, embedding);

        if (updated) {
          processed++;
          const shortTitle = (item.title || item.source_url).slice(0, 40);
          console.log(`  [${processed}/${items.length}] ${shortTitle}...`);
        } else {
          errors++;
        }

        // Rate limit delay
        await sleep(DELAY_MS);

      } catch (err) {
        console.error(`  Error processing ${item.id}:`, err);
        errors++;
      }
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('Backfill Complete');
  console.log('='.repeat(50));
  console.log(`Processed: ${processed}`);
  console.log(`Errors: ${errors}`);
  console.log(`Remaining: ${items.length - processed - errors}`);
}

main().catch(console.error);
