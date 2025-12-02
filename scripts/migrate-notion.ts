/**
 * Notion Migration Script
 *
 * Migrates content from an existing Notion database to the new Supabase-based system.
 * Each URL is sent to the processing queue to be scraped and analyzed.
 *
 * Usage:
 *   npx tsx scripts/migrate-notion.ts
 *
 * Required env vars:
 *   NOTION_API_KEY - Notion integration token
 *   NOTION_DATABASE_ID - ID of the source database
 *   NEXT_PUBLIC_SUPABASE_URL - Supabase URL
 *   SUPABASE_SERVICE_ROLE_KEY - Supabase service key
 *   GOOGLE_CLOUD_PROJECT_ID - GCP project
 *   GOOGLE_CLOUD_PUBSUB_TOPIC - Pub/Sub topic
 *   GOOGLE_APPLICATION_CREDENTIALS - Path to service account JSON (local)
 */

import { Client } from '@notionhq/client';
import { createClient } from '@supabase/supabase-js';
import { PubSub } from '@google-cloud/pubsub';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env from apps/web/.env.local
config({ path: resolve(__dirname, '../apps/web/.env.local') });

// Types
interface NotionPage {
  id: string;
  properties: Record<string, any>;
  url: string;
  created_time: string;
}

interface MigrationStats {
  total: number;
  queued: number;
  skipped: number;
  errors: number;
}

// Initialize clients
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const pubsub = new PubSub({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
});

const topicName = process.env.GOOGLE_CLOUD_PUBSUB_TOPIC || 'content-capture-process';

/**
 * Extract URL from Notion page properties
 */
function extractUrl(properties: Record<string, any>): string | null {
  // Try common property names for URL
  const urlPropertyNames = ['URL', 'url', 'Link', 'link', 'Source', 'source'];

  for (const name of urlPropertyNames) {
    const prop = properties[name];
    if (!prop) continue;

    if (prop.type === 'url' && prop.url) {
      return prop.url;
    }
    if (prop.type === 'rich_text' && prop.rich_text?.[0]?.plain_text) {
      const text = prop.rich_text[0].plain_text;
      if (text.startsWith('http')) return text;
    }
  }

  return null;
}

/**
 * Extract notes/description from Notion page
 */
function extractNotes(properties: Record<string, any>): string | null {
  const notesPropertyNames = ['Notes', 'notes', 'Description', 'description', 'Comment', 'comment'];

  for (const name of notesPropertyNames) {
    const prop = properties[name];
    if (!prop) continue;

    if (prop.type === 'rich_text' && prop.rich_text?.length > 0) {
      return prop.rich_text.map((t: any) => t.plain_text).join('');
    }
  }

  return null;
}

/**
 * Detect source type from URL
 */
function detectSourceType(url: string): 'twitter' | 'instagram' | 'linkedin' | 'pinterest' | 'web' {
  const hostname = new URL(url).hostname.toLowerCase();

  if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
    return 'twitter';
  }
  if (hostname.includes('instagram.com')) {
    return 'instagram';
  }
  if (hostname.includes('linkedin.com')) {
    return 'linkedin';
  }
  if (hostname.includes('pinterest.com')) {
    return 'pinterest';
  }
  return 'web';
}

/**
 * Check if URL already exists in Supabase
 */
async function urlExists(url: string): Promise<boolean> {
  const { data } = await supabase
    .from('content_items')
    .select('id')
    .eq('source_url', url)
    .single();

  return !!data;
}

/**
 * Create a capture record and queue for processing
 */
async function queueCapture(url: string, notes: string | null, notionPageId: string): Promise<boolean> {
  const sourceType = detectSourceType(url);

  // Create record in Supabase
  const { data, error } = await supabase
    .from('content_items')
    .insert({
      source_url: url,
      source_type: sourceType,
      status: 'pending',
      notion_page_id: notionPageId,
      platform_data: notes ? { user_notes: notes, migrated_from_notion: true } : { migrated_from_notion: true },
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error(`Failed to create record for ${url}:`, error);
    return false;
  }

  // Send to processing queue
  const topic = pubsub.topic(topicName);
  const message = {
    captureId: data.id,
    url,
    sourceType,
    notes: notes || undefined,
  };

  await topic.publishMessage({
    data: Buffer.from(JSON.stringify(message)),
    attributes: {
      sourceType,
      captureId: data.id,
    },
  });

  return true;
}

/**
 * Fetch all pages from Notion database
 */
async function fetchNotionPages(databaseId: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;

  console.log('Fetching pages from Notion...');

  do {
    const response = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const page of response.results) {
      if ('properties' in page) {
        pages.push({
          id: page.id,
          properties: (page as any).properties,
          url: (page as any).url,
          created_time: (page as any).created_time,
        });
      }
    }

    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
    console.log(`  Fetched ${pages.length} pages...`);
  } while (cursor);

  return pages;
}

/**
 * Main migration function
 */
async function migrate() {
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!databaseId) {
    console.error('NOTION_DATABASE_ID is required');
    process.exit(1);
  }

  if (!process.env.NOTION_API_KEY) {
    console.error('NOTION_API_KEY is required');
    process.exit(1);
  }

  console.log('='.repeat(50));
  console.log('Notion → Content Capture Migration');
  console.log('='.repeat(50));

  const stats: MigrationStats = {
    total: 0,
    queued: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    // Fetch all pages from Notion
    const pages = await fetchNotionPages(databaseId);
    stats.total = pages.length;

    console.log(`\nFound ${pages.length} pages to migrate\n`);

    // Process each page
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const progress = `[${i + 1}/${pages.length}]`;

      // Extract URL
      const url = extractUrl(page.properties);
      if (!url) {
        console.log(`${progress} SKIP: No URL found in page`);
        stats.skipped++;
        continue;
      }

      // Check for valid URL
      try {
        new URL(url);
      } catch {
        console.log(`${progress} SKIP: Invalid URL: ${url}`);
        stats.skipped++;
        continue;
      }

      // Check if already exists
      const exists = await urlExists(url);
      if (exists) {
        console.log(`${progress} SKIP: Already exists: ${url.slice(0, 50)}...`);
        stats.skipped++;
        continue;
      }

      // Extract notes
      const notes = extractNotes(page.properties);

      // Queue for processing
      try {
        const success = await queueCapture(url, notes, page.id);
        if (success) {
          console.log(`${progress} QUEUED: ${url.slice(0, 60)}...`);
          stats.queued++;
        } else {
          stats.errors++;
        }
      } catch (error) {
        console.error(`${progress} ERROR: ${url}`, error);
        stats.errors++;
      }

      // Small delay to avoid overwhelming the queue
      await new Promise(resolve => setTimeout(resolve, 100));
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('Migration Summary');
  console.log('='.repeat(50));
  console.log(`Total pages:    ${stats.total}`);
  console.log(`Queued:         ${stats.queued}`);
  console.log(`Skipped:        ${stats.skipped}`);
  console.log(`Errors:         ${stats.errors}`);
  console.log('='.repeat(50));

  if (stats.queued > 0) {
    console.log(`\n✓ ${stats.queued} items queued for processing.`);
    console.log('  The Cloud Function will process them in the background.');
    console.log('  Check progress at: https://console.cloud.google.com/functions/details/us-central1/process-capture?project=web-scrapbook');
  }
}

// Run migration
migrate().catch(console.error);
