/**
 * Delete items created by backfill script
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../apps/web/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('='.repeat(50));
  console.log('Delete Backfill Items');
  console.log('='.repeat(50));

  // Get all target_content_ids from content_links
  const { data: links, error: linksError } = await supabase
    .from('content_links')
    .select('target_content_id');

  if (linksError) {
    console.error('Error fetching links:', linksError);
    return;
  }

  const targetIds = [...new Set(links.map(l => l.target_content_id).filter(Boolean))] as string[];
  console.log(`Found ${targetIds.length} items to delete`);

  if (targetIds.length === 0) {
    console.log('No items to delete');
    return;
  }

  // Step 1: Delete content_links records first (they reference content_items)
  console.log('\nStep 1: Deleting content_links records...');
  const { error: deleteLinksError, count: linksDeleted } = await supabase
    .from('content_links')
    .delete()
    .not('target_content_id', 'is', null);

  if (deleteLinksError) {
    console.error('Error deleting content_links:', deleteLinksError);
    return;
  }
  console.log(`  Deleted ${linksDeleted || 'all'} content_links records`);

  // Step 2: Delete content_items created by backfill
  console.log('\nStep 2: Deleting content_items...');

  // Delete in batches to avoid issues
  const batchSize = 50;
  let totalDeleted = 0;

  for (let i = 0; i < targetIds.length; i += batchSize) {
    const batch = targetIds.slice(i, i + batchSize);
    const { error: deleteError, count } = await supabase
      .from('content_items')
      .delete()
      .in('id', batch);

    if (deleteError) {
      console.error(`Error deleting batch ${i / batchSize + 1}:`, deleteError);
    } else {
      totalDeleted += count || batch.length;
      console.log(`  Deleted batch ${Math.floor(i / batchSize) + 1}: ${count || batch.length} items`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('Deletion Complete');
  console.log('='.repeat(50));
  console.log(`Total content_items deleted: ${totalDeleted}`);

  // Verify
  const { count: remainingWeb } = await supabase
    .from('content_items')
    .select('*', { count: 'exact', head: true })
    .eq('source_type', 'web');

  const { count: remainingTwitter } = await supabase
    .from('content_items')
    .select('*', { count: 'exact', head: true })
    .eq('source_type', 'twitter');

  console.log(`\nRemaining items:`);
  console.log(`  Web: ${remainingWeb}`);
  console.log(`  Twitter: ${remainingTwitter}`);
}

main().catch(console.error);
