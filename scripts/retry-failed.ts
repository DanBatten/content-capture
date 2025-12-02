/**
 * Retry Failed Items Script
 *
 * Requeues failed items with pacing to avoid Apify rate limits.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=".gcs/content-capture-key.json" npx tsx scripts/retry-failed.ts
 *
 * Options (via env vars):
 *   BATCH_SIZE - How many to process at once (default: 5)
 *   DELAY_SECONDS - Seconds between batches (default: 30)
 *   SOURCE_TYPE - Only retry specific type: twitter, instagram, web, etc (default: all)
 */

import { createClient } from '@supabase/supabase-js';
import { PubSub } from '@google-cloud/pubsub';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../apps/web/.env.local') });

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '5');
const DELAY_SECONDS = parseInt(process.env.DELAY_SECONDS || '30');
const SOURCE_TYPE = process.env.SOURCE_TYPE || null;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const pubsub = new PubSub({ projectId: process.env.GOOGLE_CLOUD_PROJECT_ID });
const topic = pubsub.topic(process.env.GOOGLE_CLOUD_PUBSUB_TOPIC || 'content-capture-process');

function sleep(seconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function getFailedItems() {
  let query = supabase
    .from('content_items')
    .select('id, source_url, source_type, platform_data, error_message')
    .eq('status', 'failed')
    .order('created_at', { ascending: true });

  if (SOURCE_TYPE) {
    query = query.eq('source_type', SOURCE_TYPE);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch items: ${error.message}`);
  }

  return data || [];
}

async function resetItemStatus(id: string) {
  const { error } = await supabase
    .from('content_items')
    .update({
      status: 'pending',
      error_message: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    console.error(`Failed to reset status for ${id}:`, error.message);
    return false;
  }
  return true;
}

async function queueItem(item: any) {
  const message = {
    captureId: item.id,
    url: item.source_url,
    sourceType: item.source_type,
    notes: item.platform_data?.user_notes,
  };

  await topic.publishMessage({
    data: Buffer.from(JSON.stringify(message)),
  });
}

async function main() {
  console.log('='.repeat(50));
  console.log('Retry Failed Items');
  console.log('='.repeat(50));
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Delay between batches: ${DELAY_SECONDS}s`);
  if (SOURCE_TYPE) {
    console.log(`Filtering by source type: ${SOURCE_TYPE}`);
  }
  console.log('');

  const failedItems = await getFailedItems();

  if (failedItems.length === 0) {
    console.log('No failed items to retry!');
    return;
  }

  // Group by source type for display
  const byType: Record<string, number> = {};
  failedItems.forEach(item => {
    byType[item.source_type] = (byType[item.source_type] || 0) + 1;
  });

  console.log(`Found ${failedItems.length} failed items:`);
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
  console.log('');

  const totalBatches = Math.ceil(failedItems.length / BATCH_SIZE);
  const estimatedTime = totalBatches * DELAY_SECONDS;
  console.log(`Will process in ${totalBatches} batches`);
  console.log(`Estimated time: ${Math.round(estimatedTime / 60)} minutes`);
  console.log('');
  console.log('Starting in 5 seconds... (Ctrl+C to cancel)');
  await sleep(5);

  let processed = 0;
  let errors = 0;

  for (let i = 0; i < failedItems.length; i += BATCH_SIZE) {
    const batch = failedItems.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    console.log(`\n[Batch ${batchNum}/${totalBatches}] Processing ${batch.length} items...`);

    for (const item of batch) {
      try {
        // Reset status first
        const reset = await resetItemStatus(item.id);
        if (!reset) {
          errors++;
          continue;
        }

        // Queue for processing
        await queueItem(item);
        processed++;

        const shortUrl = item.source_url.length > 50
          ? item.source_url.substring(0, 50) + '...'
          : item.source_url;
        console.log(`  ✓ Queued: ${shortUrl}`);

      } catch (err) {
        console.error(`  ✗ Error: ${item.source_url}`, err);
        errors++;
      }
    }

    // Wait between batches (except for last batch)
    if (i + BATCH_SIZE < failedItems.length) {
      console.log(`  Waiting ${DELAY_SECONDS}s before next batch...`);
      await sleep(DELAY_SECONDS);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('Retry Complete');
  console.log('='.repeat(50));
  console.log(`Processed: ${processed}`);
  console.log(`Errors: ${errors}`);
  console.log('');
  console.log('Items are now being processed by the Cloud Function.');
  console.log('Check progress with: gcloud functions logs read process-capture --region us-central1 --limit 20');
}

main().catch(console.error);
