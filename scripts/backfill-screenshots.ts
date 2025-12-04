/**
 * Backfill Screenshots Script
 *
 * Goes through existing web items and takes screenshots for ones that don't have them.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=".gcs/content-capture-key.json" npx tsx scripts/backfill-screenshots.ts
 *
 * Options (via env vars):
 *   BATCH_SIZE - How many to process at once (default: 3)
 *   DELAY_SECONDS - Seconds between items to avoid rate limits (default: 10)
 *   LIMIT - Max items to process (default: all)
 *   DRY_RUN - Set to "true" to preview without making changes
 */

import { createClient } from '@supabase/supabase-js';
import { Storage } from '@google-cloud/storage';
import { ApifyClient } from 'apify-client';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../apps/web/.env.local') });

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '3');
const DELAY_SECONDS = parseInt(process.env.DELAY_SECONDS || '10');
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT) : null;
const DRY_RUN = process.env.DRY_RUN === 'true';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME || 'web-scrapbook-content-capture-media';

const apifyToken = process.env.APIFY_API_TOKEN;
if (!apifyToken) {
  console.error('APIFY_API_TOKEN is required');
  process.exit(1);
}

const apifyClient = new ApifyClient({ token: apifyToken });

function sleep(seconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

interface WebItem {
  id: string;
  source_url: string;
  title: string | null;
  platform_data: Record<string, unknown> | null;
}

async function getWebItemsWithoutScreenshots(): Promise<WebItem[]> {
  // Get web items that are complete but don't have screenshots
  let query = supabase
    .from('content_items')
    .select('id, source_url, title, platform_data')
    .eq('source_type', 'web')
    .eq('status', 'complete')
    .order('created_at', { ascending: false });

  if (LIMIT) {
    query = query.limit(LIMIT * 2); // Fetch more since we'll filter
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch items: ${error.message}`);
  }

  // Filter to items without screenshots
  const itemsWithoutScreenshots = (data || []).filter(item => {
    const hasScreenshot = item.platform_data?.screenshot;
    return !hasScreenshot;
  });

  return LIMIT ? itemsWithoutScreenshots.slice(0, LIMIT) : itemsWithoutScreenshots;
}

async function takeScreenshot(url: string): Promise<Buffer | null> {
  try {
    console.log(`    Taking screenshot of ${url}...`);
    
    // Use microlink.io screenshot API (free tier) - embed returns image directly
    const screenshotApiUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url`;
    
    const response = await fetch(screenshotApiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      console.log(`    API error: ${response.status}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || '';
    
    // If it's an image, return directly
    if (contentType.includes('image/')) {
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
    
    // Otherwise try to parse as JSON
    const data = await response.json();
    
    if (data.status === 'success' && data.data?.screenshot?.url) {
      console.log('    Downloading screenshot...');
      const imageResponse = await fetch(data.data.screenshot.url);
      if (imageResponse.ok) {
        const arrayBuffer = await imageResponse.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }
    }

    console.log('    No screenshot returned from API');
    return null;
  } catch (err) {
    console.error('    Screenshot error:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function uploadScreenshot(captureId: string, buffer: Buffer): Promise<string> {
  const bucket = storage.bucket(bucketName);
  const gcsPath = `captures/${captureId}/screenshot.png`;
  const file = bucket.file(gcsPath);

  await file.save(buffer, {
    metadata: { contentType: 'image/png' },
  });

  await file.makePublic();

  return `https://storage.googleapis.com/${bucketName}/${gcsPath}`;
}

async function updatePlatformData(id: string, screenshotUrl: string): Promise<boolean> {
  // First get current platform_data
  const { data: current, error: fetchError } = await supabase
    .from('content_items')
    .select('platform_data')
    .eq('id', id)
    .single();

  if (fetchError) {
    console.error(`    Failed to fetch current data for ${id}:`, fetchError.message);
    return false;
  }

  const updatedPlatformData = {
    ...(current?.platform_data || {}),
    screenshot: screenshotUrl,
  };

  const { error } = await supabase
    .from('content_items')
    .update({
      platform_data: updatedPlatformData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error(`    Failed to update ${id}:`, error.message);
    return false;
  }

  return true;
}

async function processItem(item: WebItem): Promise<boolean> {
  const shortUrl = item.source_url.length > 60
    ? item.source_url.substring(0, 60) + '...'
    : item.source_url;
  
  console.log(`  Processing: ${shortUrl}`);

  if (DRY_RUN) {
    console.log('    [DRY RUN] Would take screenshot and upload');
    return true;
  }

  // Take screenshot
  const screenshotBuffer = await takeScreenshot(item.source_url);
  if (!screenshotBuffer) {
    console.log('    ✗ Failed to capture screenshot');
    return false;
  }

  // Upload to GCS
  console.log('    Uploading to GCS...');
  const screenshotUrl = await uploadScreenshot(item.id, screenshotBuffer);

  // Update database
  console.log('    Updating database...');
  const updated = await updatePlatformData(item.id, screenshotUrl);
  
  if (updated) {
    console.log(`    ✓ Done: ${screenshotUrl}`);
    return true;
  }

  return false;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Backfill Screenshots for Web Items');
  console.log('='.repeat(60));
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Delay between items: ${DELAY_SECONDS}s`);
  if (LIMIT) console.log(`Limit: ${LIMIT} items`);
  if (DRY_RUN) console.log('🔸 DRY RUN MODE - no changes will be made');
  console.log('');

  const items = await getWebItemsWithoutScreenshots();

  if (items.length === 0) {
    console.log('✓ All web items already have screenshots!');
    return;
  }

  console.log(`Found ${items.length} web items without screenshots`);
  console.log('');

  const estimatedTime = items.length * DELAY_SECONDS;
  console.log(`Estimated time: ${Math.round(estimatedTime / 60)} minutes`);
  console.log('');
  console.log('Starting in 5 seconds... (Ctrl+C to cancel)');
  await sleep(5);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(`\n[${i + 1}/${items.length}]`);
    
    try {
      const success = await processItem(item);
      processed++;
      
      if (success) {
        succeeded++;
      } else {
        failed++;
      }
    } catch (err) {
      console.error(`  ✗ Error:`, err instanceof Error ? err.message : err);
      failed++;
    }

    // Delay between items (except for last one)
    if (i < items.length - 1) {
      console.log(`  Waiting ${DELAY_SECONDS}s...`);
      await sleep(DELAY_SECONDS);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Backfill Complete');
  console.log('='.repeat(60));
  console.log(`Total processed: ${processed}`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${failed}`);
  
  if (DRY_RUN) {
    console.log('\n🔸 This was a dry run. Run without DRY_RUN=true to make changes.');
  }
}

main().catch(console.error);

